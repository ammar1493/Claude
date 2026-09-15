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
