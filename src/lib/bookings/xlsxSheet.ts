import { writeZip } from "@/lib/incentives/xlsxEdit";

/**
 * One styled table, written as a workbook rather than built by SheetJS.
 *
 * The community build cannot write a fill, and the sheet the office emails is
 * a blue header over banded rows — without the fills it is not the same
 * document. An .xlsx is a zip of XML and this table needs six small parts, so
 * they are written directly: header fill, banding, borders and column widths
 * all land, and nothing has to be round-tripped through a library that would
 * drop them.
 *
 * Only what this table uses is implemented — one sheet, inline strings,
 * numbers, and blank rows. It is not a general writer and should not grow
 * into one.
 */

export interface SheetColumn {
  header: string;
  /** Width in Excel's character units. */
  width: number;
}

/** A null row is a blank separator line. */
export type SheetRow = (string | number)[] | null;

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel rejects the control characters a pasted cell can carry.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const colName = (index: number): string => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/*
 * Style indices into the cellXfs below: the header, and the two banded body
 * styles that alternate down the table.
 */
const STYLE_HEADER = 1;
const STYLE_BODY_PLAIN = 2;
const STYLE_BODY_BAND = 3;

/**
 * Excel's own "Blue, Table Style Medium 2" colours, which is what the office's
 * sheet is. Kept here rather than taken from the brand palette on purpose:
 * this document already goes out every morning looking like this, and the
 * point of the export is that nobody has to notice it changed hands.
 */
const HEADER_FILL = "FF2E75B6";
const BAND_FILL = "FFDDEBF7";
const GRID = "FF9DC3E6";

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2">
<font><sz val="10"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${HEADER_FILL}"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="${BAND_FILL}"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border>
<left style="thin"><color rgb="${GRID}"/></left>
<right style="thin"><color rgb="${GRID}"/></right>
<top style="thin"><color rgb="${GRID}"/></top>
<bottom style="thin"><color rgb="${GRID}"/></bottom>
<diagonal/>
</border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cell(ref: string, value: string | number, style: number): string {
  if (typeof value === "number") {
    return `<c r="${ref}" s="${style}"><v>${value}</v></c>`;
  }
  const text = esc(String(value));
  if (!text) return `<c r="${ref}" s="${style}"/>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function sheetXml(columns: SheetColumn[], rows: SheetRow[]): string {
  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
    .join("");

  const lines: string[] = [];
  lines.push(
    `<row r="1" ht="30" customHeight="1">${columns
      .map((c, i) => cell(`${colName(i)}1`, c.header, STYLE_HEADER))
      .join("")}</row>`,
  );

  // Banding runs down the data rows and ignores the separators, so a block
  // never starts on the same shade the one above it ended on by accident.
  let band = 0;
  rows.forEach((row, index) => {
    const r = index + 2;
    if (!row) {
      lines.push(`<row r="${r}"/>`);
      return;
    }
    const style = band % 2 === 0 ? STYLE_BODY_PLAIN : STYLE_BODY_BAND;
    band += 1;
    lines.push(
      `<row r="${r}">${columns
        .map((_, i) => cell(`${colName(i)}${r}`, row[i] ?? "", style))
        .join("")}</row>`,
    );
  });

  const last = `${colName(columns.length - 1)}${rows.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="A1:${last}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${lines.join("")}</sheetData>
<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/>
</worksheet>`;
}

/** Build the .xlsx. `sheetName` is what the tab is called. */
export async function buildStyledSheet(
  sheetName: string,
  columns: SheetColumn[],
  rows: SheetRow[],
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  // Excel refuses a tab name carrying any of these, or one over 31 characters.
  const safeName = esc(sheetName.replace(/[\\/?*[\]:]/g, "-").slice(0, 31));

  const parts: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    "xl/styles.xml": STYLES_XML,
    "xl/worksheets/sheet1.xml": sheetXml(columns, rows),
  };

  return writeZip(
    Object.entries(parts).map(([name, text]) => ({ name, data: encoder.encode(text) })),
  );
}
