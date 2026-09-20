import { readZip } from "./zip";
import { writeZip } from "./xlsxEdit";

/**
 * The month's incentive letter.
 *
 * The figure a trainer is paid ends up on one page that three people sign, and
 * that page is a Word document with the company's letterhead, its signature
 * images and its table colours on it. So it is written the same way the
 * corrected time sheets are: the office's own document, with the rows
 * replaced — not a document that merely resembles it.
 *
 * Everything outside the table comes through untouched, which is what keeps
 * the signature block, the logo and the page setup exactly as the finance
 * office approved them.
 */

export interface SummaryRow {
  /** As the trainer writes it on their own sheet — the letter follows that. */
  name: string;
  amount: number;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 28400 → "28,400.00", the way the template writes its total. */
export function formatMoney(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Replace the text of every run in a row's nth cell.
 *
 * A cell holds one run of text in this template; writing into the first and
 * emptying the rest keeps the cell's formatting — the bold on the amount, the
 * shading, the vertical centring — while changing what it says.
 */
function setCellText(row: string, cellIndex: number, value: string): string {
  const cells = [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)];
  const cell = cells[cellIndex];
  if (!cell) return row;

  let first = true;
  const rewritten = cell[0].replace(/(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g, (_all, open: string, _text: string, close: string) => {
    if (!first) return `${open.replace(/<w:t/, '<w:t xml:space="preserve"').replace(/ xml:space="preserve"(?=[\s\S]*xml:space)/, "")}${close}`;
    first = false;
    // xml:space matters: a name with a trailing space would otherwise collapse.
    const opener = /xml:space=/.test(open) ? open : open.replace(/<w:t/, '<w:t xml:space="preserve"');
    return `${opener}${escapeXml(value)}${close}`;
  });

  return row.slice(0, cell.index) + rewritten + row.slice(cell.index + cell[0].length);
}

/**
 * Word keys revisions and paragraphs by id. Cloning a row would repeat them,
 * which Word treats as a document to repair; they are optional, so they go.
 */
function stripIds(xml: string): string {
  return xml
    .replace(/\s+w14:paraId="[^"]*"/g, "")
    .replace(/\s+w14:textId="[^"]*"/g, "")
    .replace(/\s+w:rsidR="[^"]*"/g, "")
    .replace(/\s+w:rsidRDefault="[^"]*"/g, "")
    .replace(/\s+w:rsidP="[^"]*"/g, "")
    .replace(/\s+w:rsidTr="[^"]*"/g, "");
}


/**
 * Write the month into the letter's own "Month:" line.
 *
 * The office used to do this by opening last month's letter and typing over
 * it, which is why the copy we were given is named March and says April
 * inside. The month is three runs after the label — "Month:", a space, the
 * name, a space, the year — so the two that carry words are the two that
 * change, and every run's formatting survives because none of them is
 * replaced, only their text.
 */
function setMonthLabel(xml: string, monthLabel: string): string {
  const label = monthLabel.trim();
  if (!label) return xml;
  const [name, year] = (() => {
    const m = /^(.*?)\s+(\d{4})$/.exec(label);
    return m ? [m[1], m[2]] : [label, ""];
  })();

  /*
   * Not by finding the paragraph. The heading paragraph wraps a text box that
   * has a <w:p> of its own inside it, so anything matching <w:p>...</w:p>
   * stops at the inner one, several runs before the word Month ever appears.
   * The label itself is the anchor instead, and the window runs from there to
   * the end of whatever paragraph it is really in.
   */
  const anchor = /<w:t(?:\s[^>]*)?>\s*Month:\s*<\/w:t>/.exec(xml);
  if (!anchor) return xml;
  const from = anchor.index + anchor[0].length;
  const to = xml.indexOf("</w:p>", from);
  if (to < 0) return xml;

  let written = 0;
  const window = xml.slice(from, to).replace(
    /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/g,
    (all, open: string, text: string, close: string) => {
      if (!text.trim()) return all; // the spaces between the words
      written += 1;
      const opener = /xml:space=/.test(open) ? open : open.replace(/<w:t/, '<w:t xml:space="preserve"');
      // First word-run takes the month, second takes the year, and any run
      // after those is emptied — a template that spells the month across
      // three runs must not keep the tail of the old one.
      if (written === 1) return `${opener}${escapeXml(year ? name : label)}${close}`;
      if (written === 2) return `${opener}${escapeXml(year)}${close}`;
      return `${opener}${close}`;
    },
  );

  // A template that writes the whole month in one run gets the whole label.
  const filled =
    written === 1 && year
      ? window.replace(
          /(<w:t(?:\s[^>]*)?>)([\s\S]*?)(<\/w:t>)/,
          (_all, open: string, _t: string, close: string) => `${open}${escapeXml(label)}${close}`,
        )
      : window;

  return xml.slice(0, from) + filled + xml.slice(to);
}

/** A cell's declared width, in twentieths of a point. */
function setCellWidth(cell: string, width: number): string {
  return cell.replace(/<w:tcW\b[^>]*\/>/, `<w:tcW w:w="${width}" w:type="dxa"/>`);
}

/** The cells of a row, as strings. */
function cellsOf(row: string): string[] {
  return [...row.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].map((m) => m[0]);
}

/** Rebuild a row from a new list of cells, keeping its <w:trPr>. */
function withCells(row: string, cells: string[]): string {
  const open = row.slice(0, row.indexOf("<w:tc"));
  return `${open}${cells.join("")}</w:tr>`;
}

export interface SummaryDocResult {
  data: Uint8Array;
  fileName: string;
  rows: number;
  total: number;
}

/**
 * Fill the template with this month's figures.
 *
 * The table's first data row is the prototype every row is cloned from, and
 * the last row is the total; the rows between them are the previous month's
 * and are replaced. A template whose table cannot be found is refused rather
 * than guessed at — a letter three people sign is not the place for a
 * best effort.
 */
export async function buildSummaryDoc(
  templateData: ArrayBuffer,
  rows: SummaryRow[],
  monthLabel: string,
  options?: { fileNamePrefix?: string; totalDecimals?: number },
): Promise<SummaryDocResult> {
  const entries = await readZip(templateData);
  const docEntry = entries.find((e) => e.name === "word/document.xml");
  if (!docEntry) throw new Error("This file is not a readable Word document.");

  let xml = decoder.decode(docEntry.data);

  const table = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml);
  if (!table) throw new Error("The template has no table to fill in.");

  const trs = [...table[0].matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  if (trs.length < 3) {
    throw new Error(
      "The template's table needs a header row, at least one row to copy, and a total row.",
    );
  }

  const header = trs[0];
  const prototype = trs[1];
  const totalRow = trs[trs.length - 1];
  const tableOpen = table[0].slice(0, table[0].indexOf(trs[0]));

  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  const body = rows
    .map((row, i) => {
      let tr = stripIds(prototype);
      tr = setCellText(tr, 0, String(i + 1));
      tr = setCellText(tr, 1, row.name);
      tr = setCellText(tr, 2, formatMoney(row.amount));
      return tr;
    })
    .join("");

  // The total row spans the first two columns, so its cells are [label, value].
  const totalCells = [...totalRow.matchAll(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g)].length;
  const filledTotal = setCellText(
    totalRow,
    totalCells - 1,
    formatMoney(total, options?.totalDecimals ?? 2),
  );

  const rebuilt = `${tableOpen}${header}${body}${filledTotal}</w:tbl>`;
  xml = xml.slice(0, table.index) + rebuilt + xml.slice(table.index + table[0].length);
  xml = setMonthLabel(xml, monthLabel);

  docEntry.data = encoder.encode(xml);

  const prefix = options?.fileNamePrefix ?? "Monthly Incentives - Instructors";
  const fileName = `${prefix} ${monthLabel}.docx`
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return { data: await writeZip(entries), fileName, rows: rows.length, total };
}

/** A quick look at a template, so the upload slot can say what it found. */
export async function describeSummaryTemplate(
  templateData: ArrayBuffer,
): Promise<{ rows: number; columns: number }> {
  const entries = await readZip(templateData);
  const docEntry = entries.find((e) => e.name === "word/document.xml");
  if (!docEntry) throw new Error("This file is not a readable Word document.");
  const xml = decoder.decode(docEntry.data);
  const table = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml);
  if (!table) throw new Error("The template has no table to fill in.");
  const trs = [...table[0].matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  if (trs.length < 3) {
    throw new Error(
      "The template's table needs a header row, at least one row to copy, and a total row.",
    );
  }
  const columns = [...trs[0].matchAll(/<w:tc(?:\s[^>]*)?>/g)].length;
  return { rows: trs.length, columns };
}

/* ------------------------------------------------------------------ *
 * The before-and-after report
 * ------------------------------------------------------------------ */

export interface BeforeAfterRow {
  name: string;
  /** What the trainer's own sheet asked for, before anything was checked. */
  before: number;
  /** What it pays once the accepted corrections are made. */
  after: number;
  /** True when no sheet arrived and the figure is the one the system drafted. */
  drafted: boolean;
}

/**
 * The month, before and after checking.
 *
 * The letter says what each trainer is paid. This says what changed, which is
 * a different question and the one somebody signing the letter is going to
 * ask: who claimed more than the record sheet backs, by how much, and which
 * of these figures nobody actually submitted.
 *
 * It is written on the letter's own template, so it arrives looking like the
 * rest of the month's paperwork, with one column added. Adding a column to a
 * Word table means three things and Word is unforgiving about all of them:
 * the grid gains a `<w:gridCol>`, every row gains a `<w:tc>`, and the widths
 * have to keep adding up to what they added up to before — so the name column
 * gives up the space the new column takes.
 */
export async function buildBeforeAfterDoc(
  templateData: ArrayBuffer,
  rows: BeforeAfterRow[],
  monthLabel: string,
): Promise<SummaryDocResult> {
  const entries = await readZip(templateData);
  const docEntry = entries.find((e) => e.name === "word/document.xml");
  if (!docEntry) throw new Error("This file is not a readable Word document.");

  let xml = decoder.decode(docEntry.data);
  const table = /<w:tbl>[\s\S]*?<\/w:tbl>/.exec(xml);
  if (!table) throw new Error("The template has no table to fill in.");

  const trs = [...table[0].matchAll(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g)].map((m) => m[0]);
  if (trs.length < 3) {
    throw new Error(
      "The template's table needs a header row, at least one row to copy, and a total row.",
    );
  }

  const headerRow = trs[0];
  const prototype = trs[1];
  const totalRow = trs[trs.length - 1];
  const tableOpen = table[0].slice(0, table[0].indexOf(trs[0]));

  /* Widths. The amount column splits in two and the name column pays for it,
     so the table stays exactly as wide as the page expects. */
  const grid = /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/.exec(tableOpen);
  const widths = grid
    ? [...grid[0].matchAll(/<w:gridCol w:w="(\d+)"/g)].map((m) => Number(m[1]))
    : [];
  if (widths.length < 3) throw new Error("The template's table does not have three columns.");
  const [numberW, nameW, amountW] = widths;
  /*
   * The two figure columns share what the one figure column had, plus a slice
   * borrowed from the names — never more than half of it, so a long name
   * still fits. The four widths add up to the three they replaced, which is
   * what keeps the table the width of the page it was laid out for.
   */
  const borrowed = Math.min(amountW, Math.floor(nameW / 2));
  const figuresW = amountW + borrowed;
  const claimedW = Math.ceil(figuresW / 2);
  const nextWidths = [numberW, nameW - borrowed, claimedW, figuresW - claimedW];

  const nextOpen = grid
    ? tableOpen.replace(
        /<w:tblGrid>[\s\S]*?<\/w:tblGrid>/,
        `<w:tblGrid>${nextWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>`,
      )
    : tableOpen;

  /** Clone a row's amount cell so the row carries two of them. */
  const fourColumn = (row: string): string => {
    const cells = cellsOf(row);
    if (cells.length < 3) return row;
    const amount = cells[2];
    return withCells(row, [
      setCellWidth(cells[0], nextWidths[0]),
      setCellWidth(cells[1], nextWidths[1]),
      setCellWidth(amount, nextWidths[2]),
      setCellWidth(stripIds(amount), nextWidths[3]),
    ]);
  };

  let header = fourColumn(headerRow);
  header = setCellText(header, 2, "Claimed");
  header = setCellText(header, 3, "Verified");

  const body = rows
    .map((row, i) => {
      let tr = stripIds(fourColumn(prototype));
      tr = setCellText(tr, 0, String(i + 1));
      tr = setCellText(tr, 1, row.drafted ? `${row.name} (not received — drafted)` : row.name);
      tr = setCellText(tr, 2, row.drafted ? "—" : formatMoney(row.before));
      tr = setCellText(tr, 3, formatMoney(row.after));
      return tr;
    })
    .join("");

  /* The total row's label spans the first two columns, so it needs one more
     amount cell rather than one more column. */
  const totalCells = cellsOf(totalRow);
  const labelCell = setCellWidth(totalCells[0], nextWidths[0] + nextWidths[1]);
  const amountCell = totalCells[totalCells.length - 1];
  const beforeTotal = rows.reduce((sum, r) => sum + (r.drafted ? 0 : r.before), 0);
  const afterTotal = rows.reduce((sum, r) => sum + r.after, 0);
  let filledTotal = withCells(totalRow, [
    labelCell,
    setCellWidth(amountCell, nextWidths[2]),
    setCellWidth(stripIds(amountCell), nextWidths[3]),
  ]);
  filledTotal = setCellText(filledTotal, 1, formatMoney(beforeTotal, 2));
  filledTotal = setCellText(filledTotal, 2, formatMoney(afterTotal, 2));

  const rebuilt = `${nextOpen}${header}${body}${filledTotal}</w:tbl>`;
  xml = xml.slice(0, table.index) + rebuilt + xml.slice(table.index + table[0].length);
  xml = setMonthLabel(xml, monthLabel);

  docEntry.data = encoder.encode(xml);

  const fileName = `Incentive verification ${monthLabel}.docx`
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

  return { data: await writeZip(entries), fileName, rows: rows.length, total: afterTotal };
}
