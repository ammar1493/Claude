import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { GOOGLE_XLSX_URL } from "@/lib/config";

export const revalidate = 900; // 15 minutes

/**
 * Serves the training workbook that app.R read from `2024 Data.xlsx`.
 *
 * Resolution order:
 *   1. NEFT_DATA_XLSX_URL   — a published workbook URL (set in Vercel env vars)
 *   2. public/data/dataset.xlsx — a workbook committed to the repo
 *   3. the published Google workbook the R app already used
 *
 * If none of those yields a file the client falls back to an in-browser upload.
 */
export async function GET() {
  const url = process.env.NEFT_DATA_XLSX_URL?.trim();

  if (url) {
    const fetched = await fetchWorkbook(url);
    if (fetched) return workbookResponse(fetched, "env:NEFT_DATA_XLSX_URL");
  }

  const local = await readLocalWorkbook();
  if (local) return workbookResponse(local, "public/data/dataset.xlsx");

  const google = await fetchWorkbook(GOOGLE_XLSX_URL);
  if (google) return workbookResponse(google, "google-published-workbook");

  return NextResponse.json(
    {
      error: "no-dataset",
      message:
        "No training workbook is configured. Set NEFT_DATA_XLSX_URL, commit public/data/dataset.xlsx, or upload a workbook in the dashboard.",
    },
    { status: 404 },
  );
}

async function fetchWorkbook(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      next: { revalidate },
      headers: { accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*" },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return isXlsx(buf) ? buf : null;
  } catch {
    return null;
  }
}

async function readLocalWorkbook(): Promise<ArrayBuffer | null> {
  for (const name of ["dataset.xlsx", "2024 Data.xlsx"]) {
    try {
      const file = await readFile(path.join(process.cwd(), "public", "data", name));
      const buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
      if (isXlsx(buf)) return buf;
    } catch {
      /* try the next candidate */
    }
  }
  return null;
}

/** xlsx files are zip archives; anything else is an HTML error page. */
function isXlsx(buf: ArrayBuffer): boolean {
  const head = new Uint8Array(buf.slice(0, 2));
  return head[0] === 0x50 && head[1] === 0x4b;
}

function workbookResponse(buf: ArrayBuffer, source: string) {
  return new NextResponse(buf, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "x-neft-source": source,
      "cache-control": "public, max-age=0, s-maxage=900, stale-while-revalidate=3600",
    },
  });
}
