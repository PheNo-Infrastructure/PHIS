// Reading what a user uploads: a ZIP (instrument exports come zipped) and the CSVs inside it.
// Both are small readers on Node's own zlib instead of a dependency.
import { inflateRawSync } from "node:zlib";

// ponytail: stored/deflate entries found through the central directory only — no ZIP64 or
// encryption. Enough for instrument sheet exports (a few MB); a multi-GB scan archive
// (e.g. TraitFinder's .ply files) would need ZIP64.
export function readZip(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("This isn't a ZIP file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("The ZIP file is damaged.");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const next = p + 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    // Windows PowerShell's Compress-Archive writes "Sheets\x.csv"; ZIP paths use "/".
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen).replaceAll("\\", "/");
    const local = buf.readUInt32LE(p + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    if (!name.endsWith("/")) {
      if (method !== 0 && method !== 8) throw new Error(`${name} uses a ZIP compression this app can't read.`);
      files.set(name, method === 0 ? data : inflateRawSync(data));
    }
    p = next;
  }
  return files;
}

// Quoted fields ("" = a quote), CRLF or LF, a leading BOM. Rows become objects keyed by the header;
// blank lines are dropped.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head = [], ...body] = rows.filter((r) => r.some((v) => v.trim() !== ""));
  const header = head.map((h, i) => (i === 0 ? h.replace(/^﻿/, "") : h).trim());
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}
