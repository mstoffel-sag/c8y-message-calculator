/**
 * A minimal .xlsx writer.
 *
 * Enough of SpreadsheetML to produce a workbook Excel and LibreOffice both
 * open: inline strings rather than a shared-string table, a handful of named
 * styles, and no formulas. Deliberately small -- what this produces is a
 * hand-off document, not a spreadsheet application.
 */

import { makeZip, utf8, type ZipEntry } from './zip.js';

/** The styles a cell can carry. Order must match cellXfs in STYLES_XML. */
export type CellStyle =
  | 'default'
  | 'title'
  | 'heading'
  | 'label'
  | 'number'
  | 'numberBold'
  | 'note'
  | 'cellRef'
  /** An empty cell for somebody to type a price into: shaded and outlined. */
  | 'priceInput'
  | 'percentInput'
  | 'money'
  | 'moneyBold';

const STYLE_INDEX: Record<CellStyle, number> = {
  default: 0,
  title: 1,
  heading: 2,
  label: 3,
  number: 4,
  numberBold: 5,
  note: 6,
  cellRef: 7,
  priceInput: 8,
  percentInput: 9,
  money: 10,
  moneyBold: 11,
};

export interface Cell {
  /** 1-based column. */
  col: number;
  value: string | number | null;
  style?: CellStyle;
  /** An A1-style formula without the leading '=', e.g. 'SUM(H23:H47)'. */
  formula?: string;
  /**
   * The formula's result, cached so readers that do not recalculate still show
   * something sensible. The workbook also declares fullCalcOnLoad, so Excel
   * recomputes regardless.
   *
   * Only ever set to a value that cannot disagree with the formula: a figure
   * this tool already computed, or zero where the formula depends on a price
   * nobody has entered yet -- which is exactly what the formula evaluates to.
   * A cached number contradicting its own formula would be worse than a blank.
   */
  cached?: number;
}

export interface Row {
  /** 1-based row. Rows may be sparse; they are sorted before writing. */
  row: number;
  cells: Cell[];
}

export interface Sheet {
  name: string;
  /** Column widths in characters, from column A. */
  columnWidths?: number[];
  rows: Row[];
  /** Rows to keep in view when scrolling, from the top. */
  freezeRows?: number;
}

export function colName(col: number): string {
  let name = '';
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

/**
 * Excel refuses to open a file containing most control characters, so they are
 * dropped rather than escaped. Written as a codepoint filter instead of a
 * character class because a regex of literal control bytes is invisible in a
 * diff and impossible to review.
 */
function stripControl(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x20 || code === 0x09 || code === 0x0a) out += ch;
  }
  return out;
}

function esc(text: string): string {
  return stripControl(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function round(value: number): number {
  // Six decimals is more than any figure here needs, and it keeps the XML free
  // of 0.30000000000000004.
  return Number(value.toFixed(6));
}

/**
 * The used range, e.g. "A1:O30".
 *
 * Optional per the schema and recomputed by Excel, but a reader that trusts it
 * shows an empty sheet without it -- which is exactly what macOS QuickLook did.
 * Cheap to compute and strictly more correct, so it goes in.
 */
function dimensionRef(sheet: Sheet): string {
  let minCol = Number.POSITIVE_INFINITY;
  let maxCol = 0;
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = 0;

  for (const row of sheet.rows) {
    if (row.cells.length === 0) continue;
    minRow = Math.min(minRow, row.row);
    maxRow = Math.max(maxRow, row.row);
    for (const cell of row.cells) {
      minCol = Math.min(minCol, cell.col);
      maxCol = Math.max(maxCol, cell.col);
    }
  }

  if (maxRow === 0) return 'A1';
  // Anchored at A1 rather than at the first used cell. A superset range is
  // legal, and see anchorColumnA below for why not anchoring is a trap.
  return `A1:${colName(Math.max(maxCol, 1))}${maxRow}`;
}

/**
 * Gives every row a cell in column A.
 *
 * A row whose cells all start at column B or later does not render at all in
 * macOS QuickLook: the grid appears and the content does not. Bisected down to
 * exactly this, one row at a time -- an empty `<c r="A5"/>` is enough, and a
 * valued one is not required.
 *
 * These sheets keep column A as a narrow spacer so that B, C and D line up with
 * the Sales Configurator's own layout, which is the entire point of the file.
 * Shifting everything left is not an option; one empty cell per row costs
 * nothing.
 */
function anchorColumnA(rows: Row[]): Row[] {
  return rows.map((row) =>
    row.cells.length === 0 || row.cells.some((cell) => cell.col === 1)
      ? row
      : { row: row.row, cells: [{ col: 1, value: null }, ...row.cells] },
  );
}

/**
 * The shared-string table.
 *
 * Inline strings (`t="inlineStr"`) are valid SpreadsheetML and Excel reads them,
 * but they are a rarely-exercised path: macOS QuickLook parsed a workbook full
 * of them and rendered an empty grid. A shared-string table is what Excel
 * itself writes, so it is the path every reader actually supports.
 */
class Strings {
  private index = new Map<string, number>();
  readonly list: string[] = [];
  /** Total references, which the table has to declare. */
  count = 0;

  ref(text: string): number {
    this.count += 1;
    const existing = this.index.get(text);
    if (existing !== undefined) return existing;
    const at = this.list.length;
    this.index.set(text, at);
    this.list.push(text);
    return at;
  }

  xml(): string {
    return `${XML_HEAD}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${this.count}" uniqueCount="${this.list.length}">${this.list
      .map((text) => `<si><t xml:space="preserve">${esc(text)}</t></si>`)
      .join('')}</sst>`;
  }
}

function sheetXml(sheet: Sheet, strings: Strings): string {
  // Child order is fixed by the schema: dimension, sheetViews, cols, sheetData.
  const dimension = `<dimension ref="${dimensionRef(sheet)}"/>`;
  const cols = sheet.columnWidths?.length
    ? `<cols>${sheet.columnWidths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';

  const pane = sheet.freezeRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRows}" topLeftCell="A${
        sheet.freezeRows + 1
      }" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '';

  const rows = anchorColumnA([...sheet.rows].sort((a, b) => a.row - b.row))
    .map((row) => {
      const cells = [...row.cells]
        .sort((a, b) => a.col - b.col)
        .map((cell) => {
          const ref = `${colName(cell.col)}${row.row}`;
          const s = cell.style ? ` s="${STYLE_INDEX[cell.style]}"` : '';
          if (cell.formula) {
            const cached =
              cell.cached !== undefined && Number.isFinite(cell.cached)
                ? `<v>${round(cell.cached)}</v>`
                : '';
            return `<c r="${ref}"${s}><f>${esc(cell.formula)}</f>${cached}</c>`;
          }
          if (cell.value === null || cell.value === '') return `<c r="${ref}"${s}/>`;
          if (typeof cell.value === 'number') {
            // A non-finite number is not representable; an empty cell beats a
            // file Excel refuses to open.
            if (!Number.isFinite(cell.value)) return `<c r="${ref}"${s}/>`;
            return `<c r="${ref}"${s}><v>${round(cell.value)}</v></c>`;
          }
          return `<c r="${ref}"${s} t="s"><v>${strings.ref(cell.value)}</v></c>`;
        })
        .join('');
      return `<row r="${row.row}">${cells}</row>`;
    })
    .join('');

  return `${XML_HEAD}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${dimension}${pane}${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES_XML = `${XML_HEAD}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="#,##0.00"/><numFmt numFmtId="166" formatCode="0%"/></numFmts>
<fonts count="6">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="15"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF1F4E52"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF7F7F7F"/><name val="Calibri"/></font>
<font><sz val="9"/><color rgb="FF7F7F7F"/><name val="Consolas"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFE4F1F2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="3">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
<border><left style="thin"><color rgb="FFBFA060"/></left><right style="thin"><color rgb="FFBFA060"/></right><top style="thin"><color rgb="FFBFA060"/></top><bottom style="thin"><color rgb="FFBFA060"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="165" fontId="0" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const FORBIDDEN_IN_SHEET_NAME = [':', '\\', '/', '?', '*', '[', ']'];

/** Excel accepts at most 31 characters and none of : \ / ? * [ ] */
function safeSheetName(name: string, index: number): string {
  let clean = stripControl(name);
  for (const ch of FORBIDDEN_IN_SHEET_NAME) clean = clean.split(ch).join(' ');
  clean = clean.trim().slice(0, 31);
  return clean || `Sheet${index + 1}`;
}

export function buildXlsx(sheets: Sheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error('a workbook needs at least one sheet');

  const names = sheets.map((sheet, i) => safeSheetName(sheet.name, i));
  // Serialise the sheets first: doing so fills the string table they reference.
  const strings = new Strings();
  const sheetParts = sheets.map((sheet) => sheetXml(sheet, strings));

  const contentTypes = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets
  .map(
    (_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  )
  .join('')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`;

  const rootRels = `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbook = `${XML_HEAD}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names
    .map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join('')}</sheets>
<calcPr calcId="0" fullCalcOnLoad="1"/>
</workbook>`;

  const workbookRels = `${XML_HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets
  .map(
    (_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  )
  .join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId${sheets.length + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;

  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', data: utf8(contentTypes) },
    { path: '_rels/.rels', data: utf8(rootRels) },
    { path: 'xl/workbook.xml', data: utf8(workbook) },
    { path: 'xl/_rels/workbook.xml.rels', data: utf8(workbookRels) },
    { path: 'xl/styles.xml', data: utf8(STYLES_XML) },
    { path: 'xl/sharedStrings.xml', data: utf8(strings.xml()) },
    ...sheetParts.map((xml, i) => ({
      path: `xl/worksheets/sheet${i + 1}.xml`,
      data: utf8(xml),
    })),
  ];

  return makeZip(entries);
}
