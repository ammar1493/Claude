"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BRAND, HAS_DASHBOARD } from "@/lib/brand";
import { CourseCatalog, parseCourseCatalog } from "@/lib/incentives/courses";
import { payableTotal } from "@/lib/incentives/correct";
import { saveFile } from "@/lib/incentives/download";
import { downloadFindingsWorkbook } from "@/lib/incentives/export";
import {
  buildGeneratedWorkbook,
  findMissingInstructors,
  type GeneratedSheet,
} from "@/lib/incentives/generate";
import { parseRecordSheet, type ParsedRecordSheet } from "@/lib/incentives/record";
import { SiteTable, bandForSite, collectSites, mergeSites, siteKey } from "@/lib/incentives/sites";
import {
  buildBeforeAfterDoc,
  buildSummaryDoc,
  describeSummaryTemplate,
} from "@/lib/incentives/summaryDoc";
import { loadTemplate, templateLabel } from "@/lib/incentives/templates";
import { parseIncentiveSheet } from "@/lib/incentives/timesheet";
import { DEFAULT_FREELANCE_RATES } from "@/lib/incentives/types";
import type {
  Decision,
  FreelanceRates,
  IncentiveSheet,
  SiteDistance,
  SheetReport,
  Timecard,
} from "@/lib/incentives/types";
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
  /** True when the app drafted this sheet rather than a trainer sending it. */
  drafted?: boolean;
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
  /*
   * Every decision a verifier has made this month, keyed on the finding id.
   * Held here so the work survives moving between trainers, and written to
   * IndexedDB so it survives closing the tab — a month of sheets is more than
   * one sitting.
   */
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [letterTemplate, setLetterTemplate] = useState<StoredFile | null>(null);
  const [templateName, setTemplateName] = useState<string | null>(null);
  /*
   * Who is a freelancer. Held by the instructor's name as the record sheet
   * writes it, beside the distances and the timecards, because it is a fact
   * about the person and not about any one month's sheet.
   */
  const [freelancers, setFreelancers] = useState<string[]>([]);
  const [freelanceRates, setFreelanceRates] = useState<FreelanceRates>(DEFAULT_FREELANCE_RATES);

  /* The three workbooks stay in the browser between visits — the record sheet
     and the course list barely change month to month, and re-uploading them to
     re-open a report is friction with no purpose. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [
        rec,
        cou,
        all,
        savedSites,
        savedCards,
        savedExcluded,
        savedDecisions,
        savedLetter,
        savedFreelancers,
        savedRates,
      ] = await Promise.all([
        getWorkbook("record"),
        getWorkbook("courses"),
        listWorkbooks("incentive"),
        getSetting<SiteDistance[]>("incentive:sites"),
        getSetting<Timecard[]>("incentive:timecards"),
        getSetting<string[]>("incentive:excluded"),
        getSetting<Record<string, Decision>>("incentive:decisions"),
        getWorkbook("lettertemplate"),
        getSetting<string[]>("incentive:freelancers"),
        getSetting<FreelanceRates>("incentive:freelanceRates"),
      ]);
      if (cancelled) return;
      if (savedSites?.length) setSites(savedSites);
      if (savedCards?.length) setTimecards(savedCards);
      if (savedExcluded?.length) setExcluded(savedExcluded);
      if (savedDecisions) setDecisions(savedDecisions);
      if (savedLetter) setLetterTemplate({ name: savedLetter.name, data: savedLetter.data });
      if (savedFreelancers?.length) setFreelancers(savedFreelancers);
      if (savedRates) setFreelanceRates(savedRates);
      if (rec) setRecord({ name: rec.name, data: rec.data });
      if (cou) setCourses({ name: cou.name, data: cou.data });
      if (all.length) {
        setSheets(
          all
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((w) => ({ name: w.name, data: w.data, drafted: w.drafted })),
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
    const isFreelance = (name: string) =>
      freelancers.some((f) => siteKey(f) === siteKey(name));
    const out = parsedSheets.parsed.map((sheet) => {
      const first = verifySheet(sheet, rec, cat, { sites: siteTable, timecards });
      // The record sheet's spelling of the name is the one the office ticks
      // against, so the terms are looked up after the match is known.
      const who = first.matchedInstructor ?? first.sheet.instructorName;
      if (!isFreelance(who)) return first;
      return verifySheet(sheet, rec, cat, {
        sites: siteTable,
        timecards,
        freelance: true,
        freelanceRates,
      });
    });
    out.sort((a, b) =>
      (a.matchedInstructor ?? a.sheet.instructorName).localeCompare(
        b.matchedInstructor ?? b.sheet.instructorName,
      ),
    );
    return out;
  }, [
    parsedSheets.parsed,
    parsedRecord.value,
    parsedCourses.value,
    siteTable,
    timecards,
    freelancers,
    freelanceRates,
  ]);

  const failures = parsedSheets.failures;

  /* Whose sheet never arrived, and what the record sheet says they are owed. */
  const draftedNames = useMemo(
    () => new Set(sheets.filter((f) => f.drafted).map((f) => f.name)),
    [sheets],
  );

  const draftedCount = draftedNames.size;

  /* A sheet a trainer actually sent is the better template to copy. */
  const template = useMemo(() => {
    const byName = parsedSheets.parsed.find((p) => p.fileName === templateName);
    if (byName) return byName;
    return (
      parsedSheets.parsed.find((p) => !draftedNames.has(p.fileName)) ??
      parsedSheets.parsed[0] ??
      null
    );
  }, [parsedSheets.parsed, templateName, draftedNames]);

  const missing = useMemo(() => {
    const rec = parsedRecord.value;
    const cat = parsedCourses.value;
    if (!rec || !cat) return [];
    const submitted = reports
      .map((r) => r.matchedInstructor ?? r.sheet.instructorName)
      .filter(Boolean);
    return findMissingInstructors(rec, cat, submitted, timecards, siteTable, template, excluded);
  }, [parsedRecord.value, parsedCourses.value, reports, timecards, siteTable, template, excluded]);

  /*
   * A drafted sheet joins the month as a sheet.
   *
   * It is checked, corrected and paid exactly like one a trainer sent — the
   * whole point is that the month is complete — so it goes into the same store
   * the uploads live in and picks up its own tab. Only the label differs.
   */
  const generateSheets = useCallback(
    async (names: string[]): Promise<GeneratedSheet[]> => {
      const rec = parsedRecord.value;
      const cat = parsedCourses.value;
      if (!rec || !cat) return [];

      /*
       * The blank form first, a submitted sheet only if the office picked one.
       *
       * Drafting used to mean copying whichever trainer had already sent a
       * sheet and rubbing out their ticks. NE-HR050 ships with the app now, so
       * a drafted sheet starts life as the real blank \u2014 nothing of anybody
       * else's claim is in it to be missed.
       */
      const chosen = templateName ? template : null;
      const source = chosen
        ? { data: sheets.find((f) => f.name === chosen.fileName)?.data ?? null, sheet: chosen }
        : await (async () => {
            const data = await loadTemplate("incentive-form");
            return { data, sheet: parseIncentiveSheet(templateLabel("incentive-form"), data) };
          })();
      if (!source.data) throw new Error("The template workbook is no longer in this browser.");

      const out: GeneratedSheet[] = [];
      for (const name of names) {
        out.push(
          await buildGeneratedWorkbook(
            source.data,
            source.sheet,
            name,
            rec,
            cat,
            siteTable,
            timecards,
          ),
        );
      }

      const added: StoredFile[] = [];
      for (const g of out) {
        const data = g.data.slice().buffer as ArrayBuffer;
        await putWorkbook({
          id: `incentive:${g.fileName}`,
          name: g.fileName,
          kind: "incentive",
          savedAt: Date.now(),
          data,
          drafted: true,
        });
        added.push({ name: g.fileName, data, drafted: true });
      }
      setSheets((prev) => {
        const merged = new Map(prev.map((p) => [p.name, p]));
        for (const f of added) merged.set(f.name, f);
        return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
      });

      return out;
    },
    [parsedRecord.value, parsedCourses.value, template, templateName, sheets, siteTable, timecards],
  );

  const decide = useCallback((id: string, decision: Decision) => {
    setDecisions((prev) => {
      const next = { ...prev, [id]: decision };
      void putSetting("incentive:decisions", next);
      return next;
    });
  }, []);

  const decideMany = useCallback((ids: string[], decision: Decision) => {
    setDecisions((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = decision;
      void putSetting("incentive:decisions", next);
      return next;
    });
  }, []);

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

  const acceptLetterTemplate = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setError(null);
    setBusy("letter");
    try {
      const data = await file.arrayBuffer();
      // Refused now rather than at the end of the month: a template with no
      // table to fill in cannot become a letter.
      await describeSummaryTemplate(data);
      await putWorkbook({
        id: "lettertemplate",
        name: file.name,
        kind: "lettertemplate",
        savedAt: Date.now(),
        data,
      });
      setLetterTemplate({ name: file.name, data });
    } catch (e) {
      setError(`${file.name}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }, []);

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

  const monthLabel = parsedRecord.value?.monthLabel ?? "";

  const accepted = useMemo(
    () => new Set(Object.entries(decisions).filter(([, d]) => d === "accepted").map(([id]) => id)),
    [decisions],
  );

  /** Per sheet: what it will pay once the accepted corrections are made. */
  const payable = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reports) map.set(r.sheet.fileName, payableTotal(r, accepted));
    return map;
  }, [reports, accepted]);

  /*
   * Sheets still carrying a finding that would change what is paid.
   *
   * Only a finding with a fix counts: accepting it rewrites a cell and moves
   * the figure, so it is a decision somebody owes. A note with nothing to
   * apply \u2014 a session number to look up, a band the rules explain \u2014 changes
   * the same money whether it is read or not, and holding the month's letter
   * on it would train the verifier to clear the count without reading.
   */
  const undecided = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of reports) {
      map.set(
        r.sheet.fileName,
        r.findings.filter(
          (f) => f.fix && f.fix.length && (decisions[f.id] ?? "pending") === "pending",
        ).length,
      );
    }
    return map;
  }, [reports, decisions]);

  const openQuestions = [...undecided.values()].reduce((a, b) => a + b, 0);

  /** The uploaded letter if the office gave us one, else the one we ship. */
  const letterData = useCallback(
    async () => letterTemplate?.data ?? (await loadTemplate("monthly-incentives")),
    [letterTemplate],
  );

  const makeLetter = useCallback(async () => {
    setBusy("letter-out");
    setError(null);
    try {
      const rows = reports
        .map((r) => ({
          name: r.sheet.instructorName || r.matchedInstructor || r.sheet.fileName,
          amount: payable.get(r.sheet.fileName) ?? r.computedTotal,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
      const out = await buildSummaryDoc(await letterData(), rows, monthLabel || "");
      await saveFile(
        out.fileName,
        new Blob([out.data as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [letterData, reports, payable, monthLabel]);

  /**
   * The month before and after checking.
   *
   * The letter answers "what is each trainer paid". This answers "what
   * changed, and whose figure did nobody submit" \u2014 which is the question
   * anybody signing the letter asks next.
   */
  const makeReport = useCallback(async () => {
    setBusy("report-out");
    setError(null);
    try {
      const rows = reports
        .map((r) => ({
          name: r.sheet.instructorName || r.matchedInstructor || r.sheet.fileName,
          before: r.claimedTotal,
          after: payable.get(r.sheet.fileName) ?? r.verifiedTotal,
          drafted: draftedNames.has(r.sheet.fileName),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
      const out = await buildBeforeAfterDoc(await letterData(), rows, monthLabel || "");
      await saveFile(
        out.fileName,
        new Blob([out.data as BlobPart], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }, [letterData, reports, payable, draftedNames, monthLabel]);

  const saveFreelanceRates = useCallback((next: FreelanceRates) => {
    setFreelanceRates(next);
    void putSetting("incentive:freelanceRates", next);
  }, []);

  const setFreelance = useCallback((name: string, freelance: boolean) => {
    setFreelancers((prev) => {
      const key = siteKey(name);
      const next = freelance
        ? [...prev.filter((n) => siteKey(n) !== key), name].sort()
        : prev.filter((n) => siteKey(n) !== key);
      void putSetting("incentive:freelancers", next);
      return next;
    });
  }, []);

  const totals = useMemo(() => {
    const claimed = reports.reduce((s, r) => s + r.claimedTotal, 0);
    const verified = reports.reduce(
      (s, r) => s + (payable.get(r.sheet.fileName) ?? r.verifiedTotal),
      0,
    );
    return {
      claimed,
      verified,
      errors: reports.reduce((s, r) => s + r.errorCount, 0),
      warnings: reports.reduce((s, r) => s + r.warningCount, 0),
    };
  }, [reports, payable]);

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
                  onClick={() => void makeReport()}
                  disabled={busy === "report-out"}
                  title="Every sheet, claimed against verified — including the ones nobody sent."
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-ink transition-colors duration-150 hover:bg-navy-050 hover:text-navy disabled:opacity-50"
                >
                  <Icon name="document" size={14} />
                  Before / after
                </button>
                {(
                  <button
                    type="button"
                    onClick={() => void makeLetter()}
                    disabled={busy === "letter-out"}
                    title={
                      openQuestions > 0
                        ? `${openQuestions} correction${openQuestions === 1 ? " has" : "s have"} not been ruled on, so ${openQuestions === 1 ? "it leaves" : "they leave"} the trainer's claim standing in the letter.`
                        : "Every finding has been decided."
                    }
                    className="flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-xs font-bold text-white transition-[filter,scale] duration-150 ease-out hover:brightness-110 active:scale-[0.96] disabled:opacity-50"
                  >
                    <Icon name="document" size={14} />
                    Monthly Incentives
                    {openQuestions > 0 && (
                      <span className="rounded bg-white/20 px-1 text-[10px] font-bold">
                        {openQuestions}
                      </span>
                    )}
                  </button>
                )}
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

        <section className="no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                {draftedCount > 0 ? ` · ${draftedCount} drafted here` : ""}
                {failures.length ? ` · ${failures.length} could not be read` : ""}
              </p>
            )}
          </FileSlot>

          <FileSlot
            title="Incentives letter"
            hint="Optional. The app carries the Monthly Incentives letter and fills in the month itself — drop a .docx here only to write on a different one."
            icon="document"
            accept=".docx"
            loaded={Boolean(letterTemplate)}
            busy={busy === "letter"}
            onFiles={(f) => void acceptLetterTemplate(f)}
            onClear={() => {
              void deleteWorkbook("lettertemplate");
              setLetterTemplate(null);
            }}
          >
            <p className="text-xs leading-relaxed text-slate-ink">
              <span className="font-bold text-navy">
                {letterTemplate ? letterTemplate.name : templateLabel("monthly-incentives")}
              </span>
              <br />
              {letterTemplate ? "Yours, in place of the built-in one" : "Built in"}
              {reports.length > 0
                ? ` \u00b7 ${reports.length} row${reports.length === 1 ? "" : "s"} to write`
                : ""}
            </p>
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
                drafted={draftedNames}
                payable={payable}
                undecided={undecided}
                freelancers={freelancers}
                onFreelance={setFreelance}
                rates={freelanceRates}
                onRates={saveFreelanceRates}
                letterReady={Boolean(letterTemplate)}
                openQuestions={openQuestions}
                onLetter={() => void makeLetter()}
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
                decisions={decisions}
                onDecide={decide}
                onDecideMany={decideMany}
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
  drafted,
  payable,
  undecided,
  freelancers,
  onFreelance,
  rates,
  onRates,
  letterReady,
  openQuestions,
  onLetter,
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
  /** File names the app drafted, so a row can say so. */
  drafted: Set<string>;
  /** Per file: what the sheet pays once the accepted corrections are made. */
  payable: Map<string, number>;
  /** Per file: findings nobody has ruled on yet. */
  undecided: Map<string, number>;
  /** Instructors paid the freelance allowance rather than the form's rates. */
  freelancers: string[];
  onFreelance: (name: string, freelance: boolean) => void;
  /** The freelance teaching allowance, which the office sets. */
  rates: FreelanceRates;
  onRates: (next: FreelanceRates) => void;
  letterReady: boolean;
  openQuestions: number;
  onLetter: () => void;
  onOpen: (index: number) => void;
  onOpenSites: () => void;
  onOpenMissing: () => void;
  onRemove: (name: string) => void;
}) {
  const difference = totals.verified - totals.claimed;
  const who = (r: SheetReport) => r.matchedInstructor ?? r.sheet.instructorName;
  const isFreelance = (r: SheetReport) =>
    freelancers.some((f) => siteKey(f) === siteKey(who(r)));
  return (
    <div className="space-y-4">
      {letterReady && (
        <div
          className={`surface-card flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border-l-4 bg-white px-4 py-3 text-sm text-slate-ink ${
            openQuestions > 0 ? "border-l-gold" : "border-l-teal"
          }`}
        >
          <Icon
            name={openQuestions > 0 ? "warning" : "check-circle"}
            size={16}
            className={`shrink-0 ${openQuestions > 0 ? "text-gold" : "text-teal"}`}
          />
          <span className="min-w-0 flex-1">
            {openQuestions > 0 ? (
              <>
                {openQuestions} correction{openQuestions === 1 ? "" : "s"} across{" "}
                {[...undecided.values()].filter((n) => n > 0).length} sheet
                {[...undecided.values()].filter((n) => n > 0).length === 1 ? "" : "s"}{" "}
                {openQuestions === 1 ? "has" : "have"} not been ruled on. A correction nobody
                accepts is not made, so those sheets go into the letter at what the trainer claimed
                \u2014 write it now if you mean to, but those corrections will not be in it.
              </>
            ) : (
              <>
                Every finding has been decided. {sar(totals.verified)} SAR across {reports.length}{" "}
                sheet{reports.length === 1 ? "" : "s"} is ready to go into the letter.
              </>
            )}
          </span>
          <button
            type="button"
            onClick={onLetter}
            className="no-print flex items-center gap-1.5 rounded-md bg-navy px-3 py-1.5 text-xs font-bold text-white transition-[filter,scale] duration-150 ease-out hover:brightness-110 active:scale-[0.96]"
          >
            <Icon name="document" size={14} />
            Monthly Incentives (.docx)
          </button>
        </div>
      )}
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

      {freelancers.length > 0 && (
        <div className="no-print surface-card flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border-l-4 border-l-gold bg-white px-4 py-3 text-sm text-slate-ink">
          <Icon name="info" size={16} className="shrink-0 text-gold" />
          <span className="min-w-0 flex-1">
            {freelancers.length} trainer{freelancers.length === 1 ? " is" : "s are"} on the
            freelance teaching allowance, so the rate table printed on the form does not apply to
            {freelancers.length === 1 ? " them" : " them"}. Their days are valued here instead.
          </span>
          <label className="flex items-center gap-1.5 text-xs font-bold text-navy">
            Day
            <input
              type="number"
              min={0}
              step="0.5"
              value={rates.day}
              onChange={(e) => onRates({ ...rates, day: Number(e.target.value) || 0 })}
              className="w-20 rounded-md border border-hairline bg-white px-2 py-1 text-right text-xs tabular-nums text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs font-bold text-navy">
            Half day
            <input
              type="number"
              min={0}
              step="0.5"
              value={rates.half}
              onChange={(e) => onRates({ ...rates, half: Number(e.target.value) || 0 })}
              className="w-20 rounded-md border border-hairline bg-white px-2 py-1 text-right text-xs tabular-nums text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
            />
          </label>
        </div>
      )}

      <Card title={`Every sheet — ${monthLabel}`} tone="marked" inset>
        <div className="neft-scroll overflow-x-auto">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr className="text-left text-[11px] font-bold tracking-wide text-slate-ink uppercase">
                <th className="border-b border-hairline px-2 py-2">Instructor</th>
                <th className="border-b border-hairline px-2 py-2">Terms</th>
                <th className="border-b border-hairline px-2 py-2 text-right">Claimed</th>
                <th className="border-b border-hairline px-2 py-2 text-right">Verified</th>
                <th className="border-b border-hairline px-2 py-2 text-right">To pay</th>
                <th className="border-b border-hairline px-2 py-2 text-right">Difference</th>
                <th className="border-b border-hairline px-2 py-2 text-center">Must change</th>
                <th className="border-b border-hairline px-2 py-2 text-center">To rule on</th>
                <th className="no-print border-b border-hairline px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {reports.map((r, i) => {
                const pay = payable.get(r.sheet.fileName) ?? r.verifiedTotal;
                const open = undecided.get(r.sheet.fileName) ?? 0;
                const diff = pay - r.claimedTotal;
                return (
                  <tr
                    key={r.sheet.fileName}
                    className="cursor-pointer hover:bg-navy-050/50"
                    onClick={() => onOpen(i)}
                  >
                    <td
                      title={r.sheet.fileName}
                      className="border-b border-hairline px-2 py-2 font-bold text-navy"
                    >
                      {r.matchedInstructor ?? r.sheet.instructorName}
                      {!r.matchedInstructor && (
                        <span className={`ms-2 rounded px-1.5 py-0.5 text-[10px] ${SEVERITY.warning.chip}`}>
                          not in record sheet
                        </span>
                      )}
                      {drafted.has(r.sheet.fileName) && (
                        <span
                          title="No sheet arrived from this trainer, so one was drafted from the record sheet."
                          className="ms-2 rounded bg-navy-050 px-1.5 py-0.5 text-[10px] font-bold text-navy"
                        >
                          drafted
                        </span>
                      )}
                    </td>
                    <td className="no-print border-b border-hairline px-2 py-2">
                      {/* One click per trainer. A freelancer is not on the
                          form's rate table at all, so this changes what every
                          day of their month is worth. */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onFreelance(who(r), !isFreelance(r));
                        }}
                        aria-pressed={isFreelance(r)}
                        title={
                          isFreelance(r)
                            ? "Paid the freelance teaching allowance. Click for staff rates."
                            : "Paid from the rate table on the form. Click for freelance rates."
                        }
                        className={`rounded-md px-2 py-1 text-[11px] font-bold transition-colors duration-150 ${
                          isFreelance(r)
                            ? "bg-gold text-navy"
                            : "bg-navy-050 text-navy hover:bg-navy hover:text-white"
                        }`}
                      >
                        {isFreelance(r) ? "Freelance" : "Staff"}
                      </button>
                    </td>
                    <td className="border-b border-hairline px-2 py-2 text-right tabular-nums text-navy">
                      {sar(r.claimedTotal)}
                    </td>
                    <td className="border-b border-hairline px-2 py-2 text-right tabular-nums text-slate-ink">
                      {sar(r.verifiedTotal)}
                    </td>
                    <td
                      title={
                        pay > r.verifiedTotal
                          ? "More than the record sheet backs \u2014 a finding here is still undecided, so the claim stands."
                          : undefined
                      }
                      className={`border-b border-hairline px-2 py-2 text-right font-bold tabular-nums ${
                        pay > r.verifiedTotal ? "text-gold" : "text-teal"
                      }`}
                    >
                      {sar(pay)}
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
                    <td className="border-b border-hairline px-2 py-2 text-center text-xs">
                      {open > 0 ? (
                        <span className={`rounded px-1.5 py-0.5 font-bold ${SEVERITY.warning.chip}`}>
                          {open}
                        </span>
                      ) : (
                        <span className="text-slate-ink">—</span>
                      )}
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
