/**
 * Minimal, dependency-free, READ-ONLY .xlsx reader for the FM migration tooling.
 * Reads shared strings, sheet cells (value, type, formula) and whether a numeric cell carries a
 * date number-format. It never writes or modifies a workbook.
 */
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export type Cell = {
  ref: string;
  col: string;
  row: number;
  /** Raw stored value (shared strings resolved). Null for a formula with no cached value. */
  value: string | null;
  kind: "string" | "number" | "boolean" | "error" | "formula-string";
  formula: string | null;
  /** True when the cell's number format is a date/time format. */
  dateFormatted: boolean;
};

export type Sheet = { name: string; rows: Map<number, Map<string, Cell>> };
export type Workbook = { sheets: Sheet[] };

function readZip(buffer: Buffer): Map<string, Buffer> {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip/xlsx file (no end-of-central-directory).");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Corrupt zip central directory.");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const commentLen = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLen);
    const localNameLen = buffer.readUInt16LE(localOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    files.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function colToNumber(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64;
  return n;
}
export { colToNumber };

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function isDateFormatCode(code: string): boolean {
  const stripped = code.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(stripped) && !/^[#0.,?%\s]*$/.test(stripped);
}

export function readWorkbook(path: string): Workbook {
  const files = readZip(readFileSync(path));
  const text = (name: string) => {
    const buf = files.get(name);
    if (!buf) throw new Error(`Missing ${name} in workbook.`);
    return buf.toString("utf8");
  };

  const shared: string[] = [];
  if (files.has("xl/sharedStrings.xml")) {
    for (const si of text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const parts = [...si[1]!.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeEntities(m[1]!));
      shared.push(parts.join(""));
    }
  }

  const customFormats = new Map<number, string>();
  const xfDate: boolean[] = [];
  if (files.has("xl/styles.xml")) {
    const styles = text("xl/styles.xml");
    for (const m of styles.matchAll(/<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g)) {
      customFormats.set(Number(m[1]), decodeEntities(m[2]!));
    }
    const cellXfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
    for (const xf of cellXfs.matchAll(/<xf\s[^>]*?numFmtId="(\d+)"[^>]*?\/?>/g)) {
      const id = Number(xf[1]);
      xfDate.push(BUILTIN_DATE_FORMATS.has(id) || (customFormats.has(id) && isDateFormatCode(customFormats.get(id)!)));
    }
  }

  const rels = new Map<string, string>();
  for (const m of text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\s[^>]*?>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const target = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id && target) rels.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  const sheets: Sheet[] = [];
  for (const m of text("xl/workbook.xml").matchAll(/<sheet\s[^>]*?>/g)) {
    const name = decodeEntities(/name="([^"]*)"/.exec(m[0])![1]!);
    const rid = /r:id="([^"]+)"/.exec(m[0])![1]!;
    const xml = text(rels.get(rid)!);
    const rows = new Map<number, Map<string, Cell>>();
    for (const c of xml.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const body = c[2] ?? "";
      const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
      if (!ref) continue;
      const type = /\st="([^"]+)"/.exec(" " + attrs)?.[1];
      const style = /\ss="(\d+)"/.exec(" " + attrs)?.[1];
      const formula = /<f(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/f>)/.exec(body);
      const v = /<v>([\s\S]*?)<\/v>/.exec(body);
      let value: string | null = null;
      let kind: Cell["kind"] = "number";
      if (type === "s" && v) {
        value = shared[Number(v[1])] ?? null;
        kind = "string";
      } else if (type === "inlineStr") {
        value = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((t) => decodeEntities(t[1]!)).join("");
        kind = "string";
      } else if (type === "str") {
        value = v ? decodeEntities(v[1]!) : null;
        kind = "formula-string";
      } else if (type === "b") {
        value = v ? v[1]! : null;
        kind = "boolean";
      } else if (type === "e") {
        value = v ? v[1]! : null;
        kind = "error";
      } else if (v) {
        value = v[1]!;
      }
      if (value === null && !formula) continue;
      const row = Number(ref[2]);
      const col = ref[1]!;
      const cell: Cell = {
        ref: `${col}${row}`,
        col,
        row,
        value,
        kind,
        formula: formula ? (formula[1] !== undefined ? decodeEntities(formula[1]) : "") : null,
        dateFormatted: style !== undefined ? xfDate[Number(style)] === true : false,
      };
      if (!rows.has(row)) rows.set(row, new Map());
      rows.get(row)!.set(col, cell);
    }
    sheets.push({ name, rows });
  }
  return { sheets };
}

export function sheetByName(workbook: Workbook, name: string): Sheet {
  const sheet = workbook.sheets.find((s) => s.name === name);
  if (!sheet) throw new Error(`Sheet not found: ${name}`);
  return sheet;
}
