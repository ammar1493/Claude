/**
 * Editing a workbook without disturbing it.
 *
 * The corrected sheet has to be the trainer's own sheet — same layout, same
 * rates, same borders, same signature blocks — with the wrong cells put right.
 * Reading it into a spreadsheet library and writing it back out would lose
 * every fill, merge and print setting the community build cannot round-trip,
 * so nothing is rebuilt here: the .xlsx is a zip of XML, and only the handful
 * of <c> elements that change are rewritten. Everything else — styles, images,
 * data validation, the comment on row 4 — is copied through untouched.
 */

import { readZip, type ZipEntry } from "./zip";

/* ------------------------------------------------------------------ *
 * Zip writing
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

/** Build a zip. Entries are deflated where the browser can, stored otherwise. */
export async function writeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const raw = entry.data;
    const deflated = await deflateRaw(raw);
    // Compression that made the file bigger is not compression.
    const useDeflate = deflated !== null && deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, method, true);
    lv.setUint16(10, 0, true); // time
    lv.setUint16(12, 0x2821, true); // date — a fixed 2000-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    locals.push(local, body);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x2821, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centrals.push(central);

    offset += local.length + body.length;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total =
    locals.reduce((n, c) => n + c.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of [...locals, ...centrals, end]) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Cell references
 * ------------------------------------------------------------------ */

export function columnToIndex(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function indexToColumn(index: number): string {
  let n = index;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function splitRef(ref: string): { col: string; colIndex: number; row: number } | null {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref.trim());
  if (!m) return null;
  return { col: m[1].toUpperCase(), colIndex: columnToIndex(m[1]), row: Number(m[2]) };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Excel's serial for a date, counted from 1899-12-30 like the reader. */
export function dateToSerial(d: Date): number {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86_400_000);
}

/* ------------------------------------------------------------------ *
 * Sheet XML editing
 * ------------------------------------------------------------------ */

export type CellValue = number | string | null;

/** Attributes to carry over — the style index above all, never the old type. */
function keptAttrs(attrs: string): string {
  return attrs.replace(/\s+t="[^"]*"/g, "").replace(/\s+cm="[^"]*"/g, "").trimEnd();
}

function renderCell(ref: string, attrs: string, value: CellValue): string {
  const kept = keptAttrs(attrs);
  if (value === null || value === "") return `<c r="${ref}"${kept}/>`;
  if (typeof value === "number") return `<c r="${ref}"${kept}><v>${value}</v></c>`;
  // inlineStr keeps the write local to this sheet — no shared-string table to
  // renumber, and nothing else in the workbook has to change.
  return `<c r="${ref}"${kept} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

export interface EditOutcome {
  xml: string;
  applied: boolean;
  /** Set when the cell was left alone, saying why. */
  skipped?: string;
}

/**
 * Write one cell.
 *
 * A cell carrying a formula is never overwritten — the rate and total columns
 * are formulas, and replacing one with a number would quietly turn a sheet
 * that recalculates into a sheet that does not.
 */
/**
 * The style index of the nearest cell above in the same column.
 *
 * A cell written where none existed has no style: no border, no number format,
 * so a date shows as 46259 and a row of text floats outside the table. Rows
 * below a log's pre-printed block are exactly that case, so a new cell borrows
 * the look of the column it joins.
 */
function styleAbove(xml: string, col: string, row: number): string {
  for (let r = row - 1; r >= 1 && r >= row - 60; r -= 1) {
    const m = new RegExp(`<c r="${col}${r}"((?:\\s[^>]*?)?)(?:/>|>)`).exec(xml);
    const style = m ? /\ss="(\d+)"/.exec(m[1]) : null;
    if (style) return ` s="${style[1]}"`;
  }
  return "";
}

export function setCell(xml: string, ref: string, value: CellValue): EditOutcome {
  const pos = splitRef(ref);
  if (!pos) return { xml, applied: false, skipped: `"${ref}" is not a cell reference.` };

  const existing = new RegExp(`<c r="${ref}"((?:\\s[^>]*?)?)(?:/>|>([\\s\\S]*?)</c>)`).exec(xml);
  if (existing) {
    if ((existing[2] ?? "").includes("<f")) {
      return { xml, applied: false, skipped: `${ref} holds a formula and was left alone.` };
    }
    return {
      xml: xml.slice(0, existing.index) + renderCell(ref, existing[1], value) + xml.slice(existing.index + existing[0].length),
      applied: true,
    };
  }

  if (value === null || value === "") return { xml, applied: true };

  const cell = renderCell(ref, styleAbove(xml, pos.col, pos.row), value);
  const rowRe = new RegExp(`<row r="${pos.row}"((?:\\s[^>]*?)?)(?:/>|>([\\s\\S]*?)</row>)`);
  const row = rowRe.exec(xml);
  if (row) {
    const inner = row[2] ?? "";
    // Cells must stay in column order or Excel reports the file as corrupt.
    let insertAt = inner.length;
    const cellRe = /<c r="([A-Z]+)\d+"/g;
    let m: RegExpExecArray | null;
    while ((m = cellRe.exec(inner))) {
      if (columnToIndex(m[1]) > pos.colIndex) {
        insertAt = m.index;
        break;
      }
    }
    const nextInner = inner.slice(0, insertAt) + cell + inner.slice(insertAt);
    const rebuilt = `<row r="${pos.row}"${row[1]}>${nextInner}</row>`;
    return {
      xml: xml.slice(0, row.index) + rebuilt + xml.slice(row.index + row[0].length),
      applied: true,
    };
  }

  // No such row yet: add one, still in order.
  const newRow = `<row r="${pos.row}">${cell}</row>`;
  const rowsRe = /<row r="(\d+)"/g;
  let insertAt = -1;
  let m: RegExpExecArray | null;
  while ((m = rowsRe.exec(xml))) {
    if (Number(m[1]) > pos.row) {
      insertAt = m.index;
      break;
    }
  }
  if (insertAt < 0) {
    const close = xml.indexOf("</sheetData>");
    if (close < 0) {
      const selfClosing = xml.indexOf("<sheetData/>");
      if (selfClosing < 0) return { xml, applied: false, skipped: "The sheet has no cell data." };
      return {
        xml: xml.slice(0, selfClosing) + `<sheetData>${newRow}</sheetData>` + xml.slice(selfClosing + "<sheetData/>".length),
        applied: true,
      };
    }
    insertAt = close;
  }
  return { xml: xml.slice(0, insertAt) + newRow + xml.slice(insertAt), applied: true };
}

/**
 * Refresh a formula cell's cached result without touching the formula.
 *
 * Excel recalculates on open once fullCalcOnLoad is set, but the cached value
 * is what every other reader shows — including this app, when the corrected
 * sheet is fed back through it to check.
 */
export function setCachedValue(xml: string, ref: string, value: number): string {
  const re = new RegExp(`(<c r="${ref}"(?:\\s[^>]*?)?>)([\\s\\S]*?)(</c>)`);
  const m = re.exec(xml);
  if (!m || !m[2].includes("<f")) return xml;
  const inner = m[2].includes("<v>")
    ? m[2].replace(/<v>[\s\S]*?<\/v>/, `<v>${value}</v>`)
    : `${m[2]}<v>${value}</v>`;
  return xml.slice(0, m.index) + m[1] + inner + m[3] + xml.slice(m.index + m[0].length);
}

/**
 * Widen the sheet's declared range to cover every cell it now holds.
 *
 * <dimension> is a hint, but readers take it literally: SheetJS builds its
 * grid from that range, so a log rebuilt past the original last row would be
 * written correctly and then read back as if the extra rows were not there.
 * Excel repairs a stale dimension silently, which is exactly what makes the
 * bug hard to see.
 */
export function updateDimension(xml: string): string {
  let maxRow = 1;
  let maxCol = 1;
  for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"/g)) {
    const col = columnToIndex(m[1]);
    const row = Number(m[2]);
    if (col > maxCol) maxCol = col;
    if (row > maxRow) maxRow = row;
  }
  const ref = `A1:${indexToColumn(maxCol)}${maxRow}`;
  if (/<dimension\s+ref="[^"]*"\s*\/>/.test(xml)) {
    return xml.replace(/<dimension\s+ref="[^"]*"\s*\/>/, `<dimension ref="${ref}"/>`);
  }
  return xml.replace(/(<worksheet\b[^>]*>)/, `$1<dimension ref="${ref}"/>`);
}

/** Make Excel recalculate the totals the moment the file opens. */
export function forceRecalc(workbookXml: string): string {
  if (/<calcPr[^>]*\/>/.test(workbookXml)) {
    return workbookXml.replace(/<calcPr([^>]*?)\s*\/>/, (_all, attrs: string) => {
      const cleaned = attrs.replace(/\s+fullCalcOnLoad="[^"]*"/g, "");
      return `<calcPr${cleaned} fullCalcOnLoad="1"/>`;
    });
  }
  return workbookXml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
}

/* ------------------------------------------------------------------ *
 * The workbook as a whole
 * ------------------------------------------------------------------ */

export interface OpenWorkbook {
  entries: ZipEntry[];
  /** Sheet name to the zip path of its XML. */
  sheetPaths: Map<string, string>;
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export function entryText(book: OpenWorkbook, path: string): string | null {
  const entry = book.entries.find((e) => e.name === path);
  return entry ? decoder.decode(entry.data) : null;
}

export function setEntryText(book: OpenWorkbook, path: string, text: string): void {
  const entry = book.entries.find((e) => e.name === path);
  if (entry) entry.data = encoder.encode(text);
}

/** Open a workbook and work out which XML file each sheet name lives in. */
export async function openWorkbook(data: ArrayBuffer): Promise<OpenWorkbook> {
  const entries = await readZip(data);
  const book: OpenWorkbook = { entries, sheetPaths: new Map() };

  const workbookXml = entryText(book, "xl/workbook.xml");
  const relsXml = entryText(book, "xl/_rels/workbook.xml.rels");
  if (!workbookXml || !relsXml) throw new Error("This file is not a readable .xlsx workbook.");

  const targets = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (!id || !target) continue;
    targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`);
  }

  for (const m of workbookXml.matchAll(/<sheet\b[^>]*>/g)) {
    const name = /name="([^"]*)"/.exec(m[0])?.[1];
    const rid = /r:id="([^"]+)"/.exec(m[0])?.[1];
    if (!name || !rid) continue;
    const path = targets.get(rid);
    if (path) book.sheetPaths.set(unescapeXmlAttr(name), path);
  }
  return book;
}

function unescapeXmlAttr(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function saveWorkbook(book: OpenWorkbook): Promise<Uint8Array> {
  return writeZip(book.entries);
}
