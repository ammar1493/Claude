"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND, HAS_DASHBOARD } from "@/lib/brand";
import { CourseCatalog, parseCourseCatalog } from "@/lib/incentives/courses";
import { downloadFindingsWorkbook } from "@/lib/incentives/export";
import {
  buildGeneratedWorkbook,
  findMissingInstructors,
  type GeneratedSheet,
} from "@/lib/incentives/generate";
import { parseRecordSheet, type ParsedRecordSheet } from "@/lib/incentives/record";
import { SiteTable, bandForSite, collectSites, mergeSites, siteKey } from "@/lib/incentives/sites";
import { parseIncentiveSheet } from "@/lib/incentives/timesheet";
import type { IncentiveSheet, SiteDistance, SheetReport, Timecard } from "@/lib/incentives/types";
import { verifySheet } from "@/lib/incentives/verify";
import { baseName, readZip, spreadsheetEntries } from "@/lib/incentives/zip";
import {
  deleteWorkbook,
  getSetting,
  getWorkbook,
  listWorkbooks,
  putSetting,
  putWorkbook,
} from "@/lib/storage";
import { Card } from "../Card";
import { Icon } from "../Icons";
import { FileSlot } from "./FileSlot";
import { SEVERITY } from "./severity";
import { SheetReportView } from "./SheetReportView";
import { MissingSheetsPanel } from "./MissingSheetsPanel";
import { SitesPanel } from "./SitesPanel";
import { TimecardsPanel } from "./TimecardsPanel";

/** Tab ids for the two reference views, alongside the per-trainer indices. */
const ALL_SHEETS = -1;
const SITES_TAB = -2;
const TIMECARDS_TAB = -3;
const MISSING_TAB = -4;

interface StoredFile {
  name: string;
  data: ArrayBuffer;
}

const sar = (n: number) => Math.round(n).toLocaleString("en-US");

async function readFile(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export function IncentiveVerifier() {
  const [record, setRecord] = useState<StoredFile | null>(null);
  const [courses, setCourses] = useState<StoredFile | null>(null);
  const [sheets, setSheets] = useState<StoredFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<number>(ALL_SHEETS);
  const [restored, setRestored] = useState(false);
  const [sites, setSites] = useState<SiteDistance[]>([]);
  const [timecards, setTimecards] = useState<Timecard[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [templateName, setTemplateName] = useState<string | null>(null);

  /* The three workbooks stay in the browser between visits — the record sheet
     and the course list barely change month to month, and re-uploading them to
     re-open a report is friction with no purpose. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [rec, cou, all, savedSites, savedCards, savedExcluded] = await Promise.all([
        getWorkbook("record"),
        getWorkbook("courses"),
        listWorkbooks("incentive"),
        getSetting<SiteDistance[]>("incentive:sites"),
        getSetting<Timecard[]>("incentive:timecards"),
        getSetting<string[]>("incentive:excluded"),
      ]);
      if (cancelled) return;
      if (savedSites?.length) setSites(savedSites);
      if (savedCards?.length) setTimecards(savedCards);
      if (savedExcluded?.length) setExcluded(savedExcluded);
      if (rec) setRecord({ name: rec.name, data: rec.data });
      if (cou) setCourses({ name: cou.name, data: cou.data });
      if (all.length) {
        setSheets(
          all
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((w) => ({ name: w.name, data: w.data })),
        );
      }
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const parsedRecord = useMemo<{ value: ParsedRecordSheet | null; error: string | null }>(() => {
    if (!record) return { value: null, error: null };
    try {
      return { value: parseRecordSheet(record.data), error: null };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [record]);

  const parsedCourses = useMemo<{ value: CourseCatalog | null; error: string | null }>(() => {
    if (!courses) return { value: null, error: null };
    try {
      return { value: parseCourseCatalog(courses.data), error: null };
    } catch (e) {
      return { value: null, error: (e as Error).message };
    }
  }, [courses]);

  /* Parsing is the expensive half, and it does not depend on the distance
     table — so it is memoised on the files alone and re-verifying after an
     edit to a site costs nothing but the rules. */
  const parsedSheets = useMemo(() => {
    const parsed: IncentiveSheet[] = [];
    const failures: { name: string; message: string }[] = [];
    for (const file of sheets) {
      try {
        parsed.push(parseIncentiveSheet(file.name, file.data));
      } catch (e) {
        failures.push({ name: file.name, message: (e as Error).message });
      }
    }
    return { parsed, failures };
  }, [sheets]);

  const siteUsage = useMemo(
    () => (parsedRecord.value ? collectSites(parsedRecord.value.rows, parsedSheets.parsed) : []),
    [parsedRecord.value, parsedSheets.parsed],
  );

  /* Sites seen this month that the table has never heard of are folded in with
     no distance, so they show up asking for one rather than silently missing. */
  useEffect(() => {
    if (!siteUsage.length) return;
    setSites((prev) => {
      const merged = mergeSites(prev, siteUsage);
      return merged.length === prev.length ? prev : merged;
    });
  }, [siteUsage]);

  const siteTable = useMemo(() => new SiteTable(sites), [sites]);

  const reports = useMemo<SheetReport[]>(() => {
    const rec = parsedRecord.value;
    const cat = parsedCourses.value;
    if (!rec || !cat) return [];
    const out = parsedSheets.parsed.map((sheet) =>
      verifySheet(sheet, rec, cat, { sites: siteTable, timecards }),
    );
    out.sort((a, b) =>
      (a.matchedInstructor ?? a.sheet.instructorName).localeCompare(
        b.matchedInstructor ?? b.sheet.instructorName,
      ),
    );
    return out;
  }, [parsedSheets.parsed, parsedRecord.value, parsedCourses.value, siteTable, timecards]);

  const failures = parsedSheets.failures;

  /* Whose sheet never arrived, and what the record sheet says they are owed. */
  const template = useMemo(() => {
    const byName = parsedSheets.parsed.find((p) => p.fileName === templateName);
    return byName ?? parsedSheets.parsed[0] ?? null;
  }, [parsedSheets.parsed, templateName]);

  const missing = useMemo(() => {
    const rec = parsedRecord.value;
    const cat = parsedCourses.value;
    if (!rec || !cat) return [];
    const submitted = reports
      .map((r) => r.matchedInstructor ?? r.sheet.instructorName)
      .filter(Boolean);
    return findMissingInstructors(rec, cat, submitted, timecards, siteTable, template, excluded);
  }, [parsedRecord.value, parsedCourses.value, reports, timecards, siteTable, template, excluded]);

  const generateSheets = useCallback(
    async (names: string[]): Promise<GeneratedSheet[]> => {
      const rec = parsedRecord.value;
      const cat = parsedCourses.value;
      if (!rec || !cat || !template) return [];
      const file = sheets.find((f) => f.name === template.fileName);
      if (!file) throw new Error("The template workbook is no longer in this browser.");
      const out: GeneratedSheet[] = [];
      for (const name of names) {
        out.push(
          await buildGeneratedWorkbook(file.data, template, name, rec, cat, siteTable, timecards),
        );
      }
      return out;
    },
    [parsedRecord.value, parsedCourses.value, template, sheets, siteTable, timecards],
  );

  const setExclusion = useCallback((name: string, exclude: boolean) => {
    setExcluded((prev) => {
      const next = exclude
        ? [...new Set([...prev, name])].sort()
        : prev.filter((n) => n !== name);
      void putSetting("incentive:excluded", next);
      return next;
    });
  }, []);

  const unpricedSites = useMemo(
    () => siteUsage.filter((u) => bandForSite(sites.find((s) => siteKey(s.name) === u.key)) === null),
    [siteUsage, sites],
  );

  const saveSites = useCallback((next: SiteDistance[]) => {
    setSites(next);
    void putSetting("incentive:sites", next);
  }, []);

  /** Set one site, from wherever the question came up. */
  const setSite = useCallback((name: string, patch: Partial<SiteDistance>) => {
    setSites((prev) => {
      const key = siteKey(name);
      const next = prev.some((s) => siteKey(s.name) === key)
        ? prev.map((s) => (siteKey(s.name) === key ? { ...s, ...patch } : s))
        : [...prev, { name, kind: "unknown" as const, km: null, note: "", ...patch }];
      void putSetting("incentive:sites", next);
      return next;
    });
  }, []);

  const saveTimecards = useCallback((next: Timecard[]) => {
    setTimecards(next);
    void putSetting("incentive:timecards", next);
  }, []);

  const attachToTimecard = useCallback(async (card: Timecard, file: File) => {
    await putWorkbook({
      id: `timecard:${card.id}`,
      name: file.name,
      kind: "attachment",
      savedAt: Date.now(),
      data: await file.arrayBuffer(),
    });
  }, []);

  const openAttachment = useCallback(async (card: Timecard) => {
    const stored = await getWorkbook(`timecard:${card.id}`);
    if (!stored) return;
    // Blob URLs are revoked on the next tick by some browsers if released
    // immediately, so the handle is kept until the tab that opened it is gone.
    const url = URL.createObjectURL(new Blob([stored.data]));
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, []);

  const acceptReference = useCallback(
    async (kind: "record" | "courses", files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      setBusy(kind);
      try {
        const data = await readFile(file);
        // Parse before storing, so a wrong file is refused rather than kept.
        if (kind === "record") parseRecordSheet(data);
        else parseCourseCatalog(data);
        await putWorkbook({ id: kind, name: file.name, kind, savedAt: Date.now(), data });
        const next = { name: file.name, data };
        if (kind === "record") setRecord(next);
        else setCourses(next);
      } catch (e) {
        setError(`${file.name}: ${(e as Error).message}`);
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const acceptSheets = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    setBusy("sheets");
    const added: StoredFile[] = [];
    const problems: string[] = [];
    try {
      for (const file of files) {
        if (/\.zip$/i.test(file.name)) {
          const entries = spreadsheetEntries(await readZip(await readFile(file)));
          if (!entries.length) problems.push(`${file.name} holds no .xlsx sheets.`);
          for (const entry of entries) {
            // Copy out of the archive's buffer: subarray() views keep the
            // whole zip alive in IndexedDB otherwise.
            const copy = entry.data.slice().buffer as ArrayBuffer;
            added.push({ name: baseName(entry.name), data: copy });
          }
        } else if (/\.xlsx?$/i.test(file.name)) {
          added.push({ name: file.name, data: await readFile(file) });
        } else {
          problems.push(`${file.name} is not a .xlsx or .zip file.`);
        }
      }

      for (const f of added) {
        await putWorkbook({
          id: `incentive:${f.name}`,
          name: f.name,
          kind: "incentive",
          savedAt: Date.now(),
          data: f.data,
        });
      }
      setSheets((prev) => {
        const merged = new Map(prev.map((p) => [p.name, p]));
        for (const f of added) merged.set(f.name, f);
        return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
      });
      if (problems.length) setError(problems.join(" "));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, []);

  const clearSheets = useCallback(async () => {
    const stored = await listWorkbooks("incentive");
    await Promise.all(stored.map((w) => deleteWorkbook(w.id)));
    setSheets([]);
    setActive(-1);
  }, []);

  const removeSheet = useCallback(async (name: string) => {
    await deleteWorkbook(`incentive:${name}`);
    setSheets((prev) => prev.filter((s) => s.name !== name));
    setActive(-1);
  }, []);

  const totals = useMemo(() => {
    const claimed = reports.reduce((s, r) => s + r.claimedTotal, 0);
    const verified = reports.reduce((s, r) => s + r.verifiedTotal, 0);
    return {
      claimed,
      verified,
      errors: reports.reduce((s, r) => s + r.errorCount, 0),
      warnings: reports.reduce((s, r) => s + r.warningCount, 0),
    };
  }, [reports]);

  const monthLabel = parsedRecord.value?.monthLabel ?? "";
  const ready = Boolean(parsedRecord.value && parsedCourses.value);

  return (
    <div className="min-h-screen [--nav-h:64px]">
      <header className="no-print sticky top-0 z-30 border-b border-hairline bg-white">
        {/* min-h rather than h: at phone width the actions wrap onto a second
            line, and a fixed height would crop them. */}
        <div className="flex min-h-(--nav-h) flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.logo} alt="NEFT Energies" className="h-9 w-auto shrink-0" />
          <span className="text-base font-bold tracking-tight text-navy sm:text-lg">
            Incentive Verification
          </span>
          {monthLabel && (
            <span className="rounded-md bg-navy-050 px-2 py-1 text-xs font-bold text-navy">
              {monthLabel}
            </span>
          )}
          <nav className="ml-auto flex items-center gap-2">
            {reports.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => void downloadFindingsWorkbook(reports, monthLabel || "report", { sites, timecards })}
                  className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-bold text-navy transition-[filter,scale] duration-150 ease-out hover:brightness-105 active:scale-[0.96]"
                >
                  <Icon name="download" size={14} />
                  Findings workbook
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-ink transition-colors duration-150 hover:bg-navy-050 hover:text-navy"
                >
                  <Icon name="printer" size={14} />
                  Print
                </button>
              </>
            )}
            {/* Only the verifier is hosted in the standalone build, so the
                link back to the dashboard would go nowhere. */}
            {HAS_DASHBOARD && (
              <a
                href="/"
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-ink transition-colors duration-150 hover:bg-navy-050 hover:text-navy"
              >
                <Icon name="gauge" size={14} />
                Dashboard
              </a>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        {error && (
          <div className="surface-card flex items-start gap-2 rounded-xl border-l-4 border-l-[#B3261E] bg-white px-4 py-3 text-sm text-slate-ink">
            <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-[#B3261E]" />
            <div className="min-w-0 flex-1">{error}</div>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        )}

        <section className="no-print grid gap-3 lg:grid-cols-3">
          <FileSlot
            title="Record sheet"
            hint="The month's certificate export — who taught what, when and where. This is the evidence every claim is checked against."
            icon="table"
            accept=".xlsx,.xls"
            loaded={Boolean(parsedRecord.value)}
            busy={busy === "record"}
            onFiles={(f) => void acceptReference("record", f)}
            onClear={() => {
              void deleteWorkbook("record");
              setRecord(null);
            }}
          >
            {parsedRecord.error && <p className="text-xs text-[#B3261E]">{parsedRecord.error}</p>}
            {parsedRecord.value && (
              <p className="text-xs leading-relaxed text-slate-ink">
                <span className="font-bold text-navy">{record?.name}</span>
                <br />
                {parsedRecord.value.rows.length.toLocaleString("en-US")} certificates ·{" "}
                {parsedRecord.value.instructors.length} instructors · {parsedRecord.value.monthLabel}
              </p>
            )}
          </FileSlot>

          <FileSlot
            title="Course durations"
            hint="The master list saying whether a course is a half day, a full day or runs over several days."
            icon="book"
            accept=".xlsx,.xls"
            loaded={Boolean(parsedCourses.value)}
            busy={busy === "courses"}
            onFiles={(f) => void acceptReference("courses", f)}
            onClear={() => {
              void deleteWorkbook("courses");
              setCourses(null);
            }}
          >
            {parsedCourses.error && <p className="text-xs text-[#B3261E]">{parsedCourses.error}</p>}
            {parsedCourses.value && (
              <p className="text-xs leading-relaxed text-slate-ink">
                <span className="font-bold text-navy">{courses?.name}</span>
                <br />
                {parsedCourses.value.size} courses
              </p>
            )}
          </FileSlot>

          <FileSlot
            title="Incentive sheets"
            hint="The trainers' time sheets. Drop the whole .zip they arrived in, or pick the .xlsx files."
            icon="people"
            accept=".xlsx,.xls,.zip"
            multiple
            loaded={sheets.length > 0}
            busy={busy === "sheets"}
            onFiles={(f) => void acceptSheets(f)}
            onClear={() => void clearSheets()}
          >
            {sheets.length > 0 && (
              <p className="text-xs text-slate-ink">
                <span className="font-bold text-navy">{sheets.length}</span> sheet
                {sheets.length === 1 ? "" : "s"} loaded
                {failures.length ? ` · ${failures.length} could not be read` : ""}
              </p>
            )}
          </FileSlot>
        </section>

        {!ready && restored && (
          <Card tone="plain">
            <div className="mx-auto max-w-2xl py-6 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-navy text-white">
                <Icon name="check-circle" size={26} />
              </div>
              <h2 className="text-xl font-bold text-navy">Check a month of incentive sheets</h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-ink">
                Load the record sheet and the course duration list above, then drop in the trainers&apos;
                incentive sheets. Every claimed day is matched to the sessions that instructor actually
                delivered, and valued at the duration the course list gives the course — a half-day
                course claimed as a full day comes back marked, with the wording to send to the
                trainer. Nothing leaves this browser.
              </p>
            </div>
          </Card>
        )}

        {failures.length > 0 && (
          <Card title="Could not be read" tone="plain">
            <ul className="space-y-1 text-sm text-slate-ink">
              {failures.map((f) => (
                <li key={f.name}>
                  <span className="font-bold text-navy">{f.name}</span> — {f.message}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {reports.length > 0 && (
          <>
            <nav className="no-print flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setActive(ALL_SHEETS)}
                aria-current={active === ALL_SHEETS ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-[13px] font-bold transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                  active === ALL_SHEETS ? "bg-navy text-white" : "bg-white text-slate-ink hover:text-navy"
                }`}
              >
                All {reports.length} sheet{reports.length === 1 ? "" : "s"}
              </button>
              <button
                type="button"
                onClick={() => setActive(SITES_TAB)}
                aria-current={active === SITES_TAB ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                  active === SITES_TAB ? "bg-navy text-white" : "bg-white text-slate-ink hover:text-navy"
                }`}
              >
                <Icon name="building" size={14} />
                Sites &amp; distances
                {unpricedSites.length > 0 && (
                  <span
                    className={`rounded px-1 text-[10px] font-bold ${
                      active === SITES_TAB ? "bg-white/20 text-white" : SEVERITY.warning.chip
                    }`}
                  >
                    {unpricedSites.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActive(TIMECARDS_TAB)}
                aria-current={active === TIMECARDS_TAB ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                  active === TIMECARDS_TAB ? "bg-navy text-white" : "bg-white text-slate-ink hover:text-navy"
                }`}
              >
                <Icon name="calendar-check" size={14} />
                Timecards
                {timecards.length > 0 && (
                  <span
                    className={`rounded px-1 text-[10px] font-bold ${
                      active === TIMECARDS_TAB ? "bg-white/20 text-white" : "bg-navy-050 text-navy"
                    }`}
                  >
                    {timecards.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setActive(MISSING_TAB)}
                aria-current={active === MISSING_TAB ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                  active === MISSING_TAB ? "bg-navy text-white" : "bg-white text-slate-ink hover:text-navy"
                }`}
              >
                <Icon name="people" size={14} />
                Not received
                {missing.length > 0 && (
                  <span
                    className={`rounded px-1 text-[10px] font-bold ${
                      active === MISSING_TAB ? "bg-white/20 text-white" : SEVERITY.warning.chip
                    }`}
                  >
                    {missing.length}
                  </span>
                )}
              </button>
              <span aria-hidden className="mx-1 w-px self-stretch bg-hairline" />
              {reports.map((r, i) => (
                <button
                  key={r.sheet.fileName}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-current={active === i ? "page" : undefined}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition-[background-color,color,scale] duration-150 ease-out active:scale-[0.96] ${
                    active === i ? "bg-navy text-white" : "bg-white text-slate-ink hover:text-navy"
                  }`}
                >
                  {r.matchedInstructor ?? r.sheet.instructorName ?? r.sheet.fileName}
                  {r.errorCount > 0 && (
                    <span
                      className={`rounded px-1 text-[10px] font-bold ${
                        active === i ? "bg-white/20 text-white" : SEVERITY.error.chip
                      }`}
                    >
                      {r.errorCount}
                    </span>
                  )}
                </button>
              ))}
            </nav>

            {active === ALL_SHEETS && (
              <SummaryTable
                reports={reports}
                totals={totals}
                monthLabel={monthLabel}
                unpricedSites={unpricedSites.length}
                missingCount={missing.length}
                onOpen={setActive}
                onOpenSites={() => setActive(SITES_TAB)}
                onOpenMissing={() => setActive(MISSING_TAB)}
                onRemove={(name) => void removeSheet(name)}
              />
            )}
            {active === SITES_TAB && (
              <SitesPanel usage={siteUsage} sites={sites} onChange={saveSites} />
            )}
            {active === MISSING_TAB && (
              <MissingSheetsPanel
                missing={missing}
                templates={parsedSheets.parsed.map((p) => ({ name: p.fileName, sheet: p }))}
                templateName={template?.fileName ?? null}
                excluded={excluded}
                monthLabel={monthLabel}
                onTemplate={setTemplateName}
                onExclude={setExclusion}
                onGenerate={generateSheets}
              />
            )}
            {active === TIMECARDS_TAB && (
              <TimecardsPanel
                timecards={timecards}
                onChange={saveTimecards}
                onAttach={attachToTimecard}
                onOpenAttachment={(card) => void openAttachment(card)}
                instructors={parsedRecord.value?.instructors ?? []}
              />
            )}
            {active >= 0 && reports[active] && (
              <SheetReportView
                key={reports[active].sheet.fileName}
                report={reports[active]}
                original={
                  sheets.find((f) => f.name === reports[active].sheet.fileName)?.data ?? null
                }
                sites={sites}
                onSetSite={setSite}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SummaryTable({
  reports,
  totals,
  monthLabel,
  unpricedSites,
  missingCount,
  onOpen,
  onOpenSites,
  onOpenMissing,
  onRemove,
}: {
  reports: SheetReport[];
  totals: { claimed: number; verified: number; errors: number; warnings: number };
  monthLabel: string;
  unpricedSites: number;
  missingCount: number;
  onOpen: (index: number) => void;
  onOpenSites: () => void;
  onOpenMissing: () => void;
  onRemove: (name: string) => void;
}) {
  const difference = totals.verified - totals.claimed;
  return (
    <div className="space-y-4">
      {missingCount > 0 && (
        <div className="surface-card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-l-4 border-l-gold bg-white px-4 py-3 text-sm text-slate-ink">
          <Icon name="people" size={16} className="shrink-0 text-gold" />
          <span className="min-w-0 flex-1">
            {missingCount} trainer{missingCount === 1 ? "" : "s"} taught this month and sent no
            sheet, so nothing was claimed for {missingCount === 1 ? "them" : "them"}.
          </span>
          <button
            type="button"
            onClick={onOpenMissing}
            className="no-print rounded-md bg-gold px-3 py-1.5 text-xs font-bold text-navy transition-[filter,scale] duration-150 ease-out hover:brightness-105 active:scale-[0.96]"
          >
            Draft their sheets
          </button>
        </div>
      )}
      {unpricedSites > 0 && (
        <div className="surface-card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-l-4 border-l-gold bg-white px-4 py-3 text-sm text-slate-ink">
          <Icon name="warning" size={16} className="shrink-0 text-gold" />
          <span className="min-w-0 flex-1">
            {unpricedSites} location{unpricedSites === 1 ? "" : "s"} in this month{"’"}s sheets{" "}
            {unpricedSites === 1 ? "has" : "have"} no distance set, so the days spent there cannot be
            priced against a rate band yet.
          </span>
          <button
            type="button"
            onClick={onOpenSites}
            className="no-print rounded-md bg-gold px-3 py-1.5 text-xs font-bold text-navy transition-[filter,scale] duration-150 ease-out hover:brightness-105 active:scale-[0.96]"
          >
            Set the distances
          </button>
        </div>
      )}
      <div className="stage stage-1 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Sheets checked", value: String(reports.length), tone: "text-navy" },
          { label: "Claimed", value: `${sar(totals.claimed)} SAR`, tone: "text-navy" },
          { label: "Verified", value: `${sar(totals.verified)} SAR`, tone: "text-teal" },
          {
            label: "Difference",
            value: `${difference === 0 ? "" : difference < 0 ? "−" : "+"}${sar(Math.abs(difference))} SAR`,
            tone: difference < 0 ? "text-[#B3261E]" : "text-navy",
          },
        ].map((f) => (
          <div key={f.label} className="surface-card print-block rounded-xl bg-white px-4 py-3">
            <p className="text-[11px] font-bold tracking-wide text-slate-ink uppercase">{f.label}</p>
            <p className={`mt-0.5 text-2xl leading-tight font-black tabular-nums ${f.tone}`}>
              {f.value}
            </p>
          </div>
        ))}
      </div>

      <Card title={`Every sheet — ${monthLabel}`} tone="marked" inset>
        <div className="neft-scroll overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold tracking-wide text-slate-ink uppercase">
                <th className="border-b border-hairline px-2 py-2">Instructor</th>
                <th className="border-b border-hairline px-2 py-2">Sheet</th>
                <th className="border-b border-hairline px-2 py-2 text-right">Claimed</th>
                <th className="border-b border-hairline px-2 py-2 text-right">Verified</th>
                <th className="border-b border-hairline px-2 py-2 text-right">Difference</th>
                <th className="border-b border-hairline px-2 py-2 text-center">Must change</th>
                <th className="border-b border-hairline px-2 py-2 text-center">Check</th>
                <th className="no-print border-b border-hairline px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => {
                const diff = r.verifiedTotal - r.claimedTotal;
                return (
                  <tr
                    key={r.sheet.fileName}
                    className="cursor-pointer hover:bg-navy-050/50"
                    onClick={() => onOpen(i)}
                  >
                    <td className="border-b border-hairline px-2 py-2 font-bold text-navy">
                      {r.matchedInstructor ?? r.sheet.instructorName}
                      {!r.matchedInstructor && (
                        <span className={`ms-2 rounded px-1.5 py-0.5 text-[10px] ${SEVERITY.warning.chip}`}>
                          not in record sheet
                        </span>
                      )}
                    </td>
                    <td className="max-w-[280px] truncate border-b border-hairline px-2 py-2 text-xs text-slate-ink">
                      {r.sheet.fileName}
                    </td>
                    <td className="border-b border-hairline px-2 py-2 text-right tabular-nums text-navy">
                      {sar(r.claimedTotal)}
                    </td>
                    <td className="border-b border-hairline px-2 py-2 text-right font-bold tabular-nums text-teal">
                      {sar(r.verifiedTotal)}
                    </td>
                    <td
                      className={`border-b border-hairline px-2 py-2 text-right font-bold tabular-nums ${
                        diff < 0 ? "text-[#B3261E]" : diff > 0 ? "text-gold" : "text-slate-ink"
                      }`}
                    >
                      {diff === 0 ? "—" : `${diff < 0 ? "−" : "+"}${sar(Math.abs(diff))}`}
                    </td>
                    <td className="border-b border-hairline px-2 py-2 text-center">
                      {r.errorCount > 0 ? (
                        <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${SEVERITY.error.chip}`}>
                          {r.errorCount}
                        </span>
                      ) : (
                        <Icon name="check-circle" size={15} className="mx-auto text-teal" />
                      )}
                    </td>
                    <td className="border-b border-hairline px-2 py-2 text-center text-xs text-slate-ink">
                      {r.warningCount || "—"}
                    </td>
                    <td className="no-print border-b border-hairline px-2 py-2 text-right">
                      <button
                        type="button"
                        aria-label={`Remove ${r.sheet.fileName}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(r.sheet.fileName);
                        }}
                        className="rounded p-1 text-slate-ink transition-colors duration-150 hover:bg-navy-050 hover:text-navy"
                      >
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
