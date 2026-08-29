import { NextResponse } from "next/server";
import { GOOGLE_XLSX_URL, QUESTIONS_MAP } from "@/lib/config";
import { readSheetAsMatrix } from "@/lib/xlsx";

export const revalidate = 900;

/**
 * get_google_sheet_tab() from app.R: download the published workbook and read
 * one named tab. Fetching it here rather than in the browser keeps the request
 * same-origin, which the published Google endpoint would otherwise refuse.
 */
export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim();
  if (!name) {
    return NextResponse.json({ error: "missing-name", message: "Pass ?name=<sheet tab>." }, { status: 400 });
  }
  // Only the evaluation tabs the dashboard knows about are proxied.
  if (!QUESTIONS_MAP.some((q) => q.sheet === name)) {
    return NextResponse.json(
      { error: "unknown-sheet", message: `"${name}" is not one of the evaluation tabs.` },
      { status: 400 },
    );
  }

  const url = process.env.NEFT_QUALITY_XLSX_URL?.trim() || GOOGLE_XLSX_URL;

  let buf: ArrayBuffer;
  try {
    const res = await fetch(url, { redirect: "follow", next: { revalidate } });
    if (!res.ok) {
      return NextResponse.json(
        { error: "fetch-failed", message: `The published workbook returned HTTP ${res.status}.` },
        { status: 502 },
      );
    }
    buf = await res.arrayBuffer();
  } catch {
    return NextResponse.json(
      { error: "fetch-failed", message: "The published workbook could not be reached." },
      { status: 502 },
    );
  }

  try {
    const sheet = readSheetAsMatrix(buf, name);
    if (!sheet) {
      return NextResponse.json(
        { error: "sheet-not-found", message: `The workbook has no tab named "${name}".` },
        { status: 404 },
      );
    }
    return NextResponse.json(sheet, {
      headers: { "cache-control": "public, max-age=0, s-maxage=900, stale-while-revalidate=3600" },
    });
  } catch {
    return NextResponse.json(
      { error: "parse-failed", message: "The published workbook could not be parsed." },
      { status: 500 },
    );
  }
}
