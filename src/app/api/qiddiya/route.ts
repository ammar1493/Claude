import { NextResponse } from "next/server";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { QIDDIYA_FILE_PATTERN } from "@/lib/config";

export const revalidate = 900;

const DIR = path.join(process.cwd(), "public", "qiddiya");

/**
 * qiddiya_files() from app.R, adapted to the deployment: instead of scanning
 * working directories at runtime, the QCTA workbooks committed under
 * `public/qiddiya/` are listed here. Anything else is uploaded in the browser.
 */
export async function GET(request: Request) {
  const file = new URL(request.url).searchParams.get("file");

  if (!file) {
    return NextResponse.json({ files: await listFiles() });
  }

  // Serve one workbook. Only plain names inside the folder are allowed.
  if (file.includes("/") || file.includes("\\") || file.includes("..")) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }
  const available = await listFiles();
  if (!available.includes(file)) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const buf = await readFile(path.join(DIR, file));
  return new NextResponse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "cache-control": "public, max-age=0, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}

async function listFiles(): Promise<string[]> {
  try {
    const names = await readdir(DIR);
    return names.filter(
      (n) => /\.xlsx$/i.test(n) && QIDDIYA_FILE_PATTERN.test(n) && !n.startsWith("~$"),
    );
  } catch {
    return [];
  }
}
