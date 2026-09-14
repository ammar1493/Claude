/**
 * Just enough ZIP to open the folder of incentive sheets trainers send.
 *
 * The sheets arrive as one attachment per month — eleven .xlsx files inside a
 * .zip — and asking a verifier to unpack it first is a step they should not
 * have to take. Only the two cases a zip of spreadsheets ever uses are
 * handled: stored (method 0) and deflate (method 8), the latter through the
 * browser's own DecompressionStream so nothing is bundled for it.
 */

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function findEndOfCentralDirectory(view: DataView): number {
  // The record is 22 bytes plus a comment of up to 64 KB, so scan back.
  const start = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= start; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  return -1;
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error(
      "This browser cannot unzip files. Open the .zip yourself and add the .xlsx sheets instead.",
    );
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

/** Every file in the archive, directories and empty entries dropped. */
export async function readZip(data: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(data);
  const bytes = new Uint8Array(data);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) throw new Error("This file is not a readable .zip archive.");

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    if (offset + 46 > view.byteLength || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    if (name.endsWith("/") || compressedSize === 0) continue;
    // The local header repeats the name and extra fields, at its own lengths.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);

    if (method === 0) entries.push({ name, data: raw.slice() });
    else if (method === 8) entries.push({ name, data: await inflateRaw(raw) });
    else throw new Error(`"${name}" uses an unsupported compression method (${method}).`);
  }

  return entries;
}

/** Spreadsheets in the archive, skipping macOS resource forks. */
export function spreadsheetEntries(entries: ZipEntry[]): ZipEntry[] {
  return entries.filter(
    (e) =>
      /\.xlsx?$/i.test(e.name) &&
      !e.name.split("/").some((part) => part === "__MACOSX" || part.startsWith("._")),
  );
}

export function baseName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}
