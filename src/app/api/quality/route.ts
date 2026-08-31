import { NextResponse } from "next/server";
import { GOOGLE_XLSX_URL, QUESTIONS_MAP } from "@/lib/config";
import { readSheetAsMatrix } from "@/lib/xlsx";

/**
 * Every evaluation tab in one response.
 *
 * app.R called get_google_sheet_tab() once per question, re-downloading and
 * re-parsing the whole workbook each time. The scorecard needs all thirteen at
 * once, so the workbook is fetched and parsed a single time here.
 *
 * Each row is an instructor and the counts of 1..5 star responses, which is the
 * shape the R app read from columns 2-6.
 */
export const dynamic = "force-dynamic";

const CACHE_SECONDS = 900;

export interface QualityRow {
  instructor: string;
  counts: [number, number, number, number, number];
}

export interface QualitySheet {
  question: string;
  sheet: string;
  rows: QualityRow[];
}

export async function GET() {
  const url = process.env.NEFT_QUALITY_XLSX_URL?.trim() || GOOGLE_XLSX_URL;

  let buf: ArrayBuffer;
  try {
    const res = await fetch(url, { redirect: "follow", next: { revalidate: CACHE_SECONDS } });
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

  const sheets: QualitySheet[] = [];
  const missing: string[] = [];

  for (const q of QUESTIONS_MAP) {
    let matrix: ReturnType<typeof readSheetAsMatrix> = null;
    try {
      matrix = readSheetAsMatrix(buf, q.sheet);
    } catch {
      matrix = null;
    }
    if (!matrix) {
      missing.push(q.sheet);
      continue;
    }

    const rows: QualityRow[] = [];
    for (const raw of matrix.rows) {
      const instructor = String(raw[0] ?? "").trim();
      if (!instructor) continue;
      const counts = [1, 2, 3, 4, 5].map((i) => {
        const v = Number(raw[i]);
        return Number.isFinite(v) && v > 0 ? v : 0;
      }) as QualityRow["counts"];
      if (counts.every((c) => c === 0)) continue;
      rows.push({ instructor, counts });
    }
    sheets.push({ question: q.label, sheet: q.sheet, rows });
  }

  if (!sheets.length) {
    return NextResponse.json(
      {
        error: "no-sheets",
        message:
          "The workbook was read but none of the evaluation tabs were found. Expected one tab per question, e.g. \"Well prepared\".",
        missing,
      },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { sheets, missing },
    { headers: { "cache-control": `public, max-age=0, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=3600` } },
  );
}
