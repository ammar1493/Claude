"use client";

import { useState } from "react";
import { saveFile } from "@/lib/incentives/download";
import {
  buildGeneratedWorkbook,
  zipGeneratedSheets,
  type GeneratedSheet,
  type MissingInstructor,
} from "@/lib/incentives/generate";
import type { IncentiveSheet } from "@/lib/incentives/types";
import { Card } from "../Card";
import { Icon } from "../Icons";
import { SEVERITY } from "./severity";

const sar = (n: number) => Math.round(n).toLocaleString("en-US");
const days = (n: number) => (n === 0.5 ? "½" : n % 1 ? n.toFixed(1) : String(n));

/**
 * The sheets that never arrived.
 *
 * A claim nobody made is the one kind of error a verifier cannot see: there is
 * no sheet to check, and the trainer is simply not paid. The record sheet
 * already holds their month — who taught, on which day, for how long — so the
 * missing sheets are drafted from it on the template the others came in on,
 * and go out to be checked and signed rather than chased from nothing.
 */
export function MissingSheetsPanel({
  missing,
  templates,
  templateName,
  excluded,
  monthLabel,
  onTemplate,
  onExclude,
  onGenerate,
}: {
  missing: MissingInstructor[];
  templates: { name: string; sheet: IncentiveSheet }[];
  templateName: string | null;
  excluded: string[];
  monthLabel: string;
  onTemplate: (name: string) => void;
  onExclude: (name: string, excluded: boolean) => void;
  onGenerate: (names: string[]) => Promise<GeneratedSheet[]>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<GeneratedSheet[] | null>(null);

  const owed = missing.reduce((sum, m) => sum + (m.estimate ?? 0), 0);
  const anyUnpriced = missing.some((m) => m.unpriced.length > 0 || m.estimate === null);

  const generate = async (names: string[], label: string) => {
    setBusy(label);
    setError(null);
    try {
      const sheets = await onGenerate(names);
      if (!sheets.length) {
        setError("Nothing to draft.");
        return;
      }
      if (sheets.length === 1) {
        await saveFile(sheets[0].fileName, new Blob([sheets[0].data as BlobPart]));
      } else {
        const zip = await zipGeneratedSheets(sheets);
        await saveFile(
          `Drafted incentive sheets ${monthLabel}.zip`.replace(/\s+/g, " ").trim(),
          new Blob([zip as BlobPart], { type: "application/zip" }),
        );
      }
      setDone(sheets);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="stage stage-1 surface-card rounded-xl border-l-4 border-l-gold bg-white px-4 py-3">
        <h2 className="text-sm font-bold text-navy">Trainers who taught and did not send a sheet</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-ink">
          A claim nobody made is invisible: no sheet arrives, nothing is checked, and the trainer is
          not paid. The record sheet already holds the month — who taught, on which day, at what
          length — so a sheet can be drafted from it on the same template the others came in on.
        </p>
        <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-slate-ink">
          <strong className="text-navy">A draft is a draft.</strong> It is what the record sheet says
          is owed, not what the trainer claims, and the two differ — a travelling day, a per diem, a
          class the certificates do not show. Send it to be checked and signed, never straight to
          payroll.
        </p>
      </div>

      {missing.length === 0 ? (
        <Card tone="plain">
          <p className="py-6 text-center text-sm text-slate-ink">
            <Icon name="check-circle" size={16} className="me-1 inline align-[-3px] text-teal" />
            Every trainer with sessions in {monthLabel || "this month"} now has a sheet in this
            month — sent by them, or drafted here.
          </p>
        </Card>
      ) : (
        <>
          <div className="stage stage-2 grid gap-3 sm:grid-cols-3">
            <div className="surface-card rounded-xl bg-white px-4 py-3">
              <p className="text-[11px] font-bold tracking-wide text-slate-ink uppercase">
                Sheets not received
              </p>
              <p className="mt-0.5 text-2xl leading-tight font-black tabular-nums text-navy">
                {missing.length}
              </p>
            </div>
            <div className="surface-card rounded-xl bg-white px-4 py-3">
              <p className="text-[11px] font-bold tracking-wide text-slate-ink uppercase">
                Days unclaimed
              </p>
              <p className="mt-0.5 text-2xl leading-tight font-black tabular-nums text-navy">
                {days(missing.reduce((s, m) => s + m.dayValue, 0))}
              </p>
            </div>
            <div className="surface-card rounded-xl bg-white px-4 py-3">
              <p className="text-[11px] font-bold tracking-wide text-slate-ink uppercase">
                Drafted value
              </p>
              <p className="mt-0.5 text-2xl leading-tight font-black tabular-nums text-teal">
                {sar(owed)} SAR
              </p>
              {anyUnpriced && (
                <p className="mt-0.5 text-[11px] leading-snug text-slate-ink">
                  Short by any day at a site with no distance set.
                </p>
              )}
            </div>
          </div>

          <Card
            title={`Not received — ${monthLabel}`}
            tone="marked"
            inset
            action={
              <div className="no-print flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-ink">
                  Template
                  <select
                    value={templateName ?? ""}
                    onChange={(e) => onTemplate(e.target.value)}
                    className="max-w-[200px] rounded-md border border-hairline bg-white px-2 py-1 text-xs text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30"
                  >
                    {templates.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.sheet.instructorName || t.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={!templateName || busy !== null || !missing.length}
                  onClick={() => void generate(missing.map((m) => m.name), "all")}
                  className="flex items-center gap-1.5 rounded-md bg-gold px-3 py-1.5 text-xs font-bold text-navy transition-[filter,scale] duration-150 ease-out hover:brightness-105 active:scale-[0.96] disabled:opacity-50"
                >
                  <Icon name="download" size={13} />
                  {busy === "all" ? "Drafting…" : `Draft all ${missing.length} as a .zip`}
                </button>
              </div>
            }
          >
            <div className="neft-scroll overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-bold tracking-wide text-slate-ink uppercase">
                    <th className="border-b border-hairline px-2 py-2">Instructor</th>
                    <th className="border-b border-hairline px-2 py-2 text-right">Days taught</th>
                    <th className="border-b border-hairline px-2 py-2 text-right">Day value</th>
                    <th className="border-b border-hairline px-2 py-2 text-right">Sessions</th>
                    <th className="border-b border-hairline px-2 py-2 text-right">Participants</th>
                    <th className="border-b border-hairline px-2 py-2 text-right">Drafts to</th>
                    <th className="no-print border-b border-hairline px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {missing.map((m) => (
                    <tr key={m.name} className="hover:bg-navy-050/40">
                      <td className="border-b border-hairline px-2 py-2">
                        <span className="font-bold text-navy">{m.name}</span>
                        {m.timecardDays > 0 && (
                          <span className="ms-2 rounded bg-navy-050 px-1.5 py-0.5 text-[10px] font-bold text-navy">
                            {m.timecardDays} timecard {m.timecardDays === 1 ? "day" : "days"}
                          </span>
                        )}
                        {m.unpriced.length > 0 && (
                          <span
                            className={`ms-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${SEVERITY.warning.chip}`}
                            title={m.unpriced.join(", ")}
                          >
                            {m.unpriced.length} site
                            {m.unpriced.length === 1 ? "" : "s"} unpriced
                          </span>
                        )}
                      </td>
                      <td className="border-b border-hairline px-2 py-2 text-right tabular-nums text-slate-ink">
                        {m.days}
                      </td>
                      <td className="border-b border-hairline px-2 py-2 text-right font-bold tabular-nums text-navy">
                        {days(m.dayValue)}
                      </td>
                      <td className="border-b border-hairline px-2 py-2 text-right tabular-nums text-slate-ink">
                        {m.sessions || "—"}
                      </td>
                      <td className="border-b border-hairline px-2 py-2 text-right tabular-nums text-slate-ink">
                        {m.participants || "—"}
                      </td>
                      <td className="border-b border-hairline px-2 py-2 text-right font-bold tabular-nums text-teal">
                        {m.estimate === null ? "—" : `${sar(m.estimate)} SAR`}
                      </td>
                      <td className="no-print border-b border-hairline px-2 py-2 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={!templateName || busy !== null}
                          onClick={() => void generate([m.name], m.name)}
                          className="rounded-md bg-navy px-2.5 py-1 text-[11px] font-bold text-white transition-[background-color,scale] duration-150 ease-out hover:bg-navy-600 active:scale-[0.96] disabled:opacity-40"
                        >
                          {busy === m.name ? "Drafting…" : "Draft"}
                        </button>
                        <button
                          type="button"
                          onClick={() => onExclude(m.name, true)}
                          title="Not a trainer we pay — leave them off this list"
                          aria-label={`Exclude ${m.name}`}
                          className="ms-1 rounded p-1 text-slate-ink hover:bg-navy-050 hover:text-navy"
                        >
                          <Icon name="x" size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {excluded.length > 0 && (
        <Card title={`Left off the list (${excluded.length})`} tone="plain">
          <p className="mb-2 text-xs leading-relaxed text-slate-ink">
            Names excluded from the missing-sheet list and remembered for every month after —
            freelancers, partner companies, anyone who is not paid on this scheme.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {excluded.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onExclude(name, false)}
                className="flex items-center gap-1 rounded-md bg-fog px-2 py-1 text-xs font-medium text-slate-ink transition-colors duration-150 hover:bg-navy-050 hover:text-navy"
              >
                {name}
                <Icon name="plus" size={11} />
              </button>
            ))}
          </div>
        </Card>
      )}

      {error && (
        <div className={`rounded-xl px-4 py-3 text-sm ${SEVERITY.error.chip}`}>{error}</div>
      )}

      {done && (
        <div className="surface-card rounded-xl border-l-4 border-l-teal bg-white px-4 py-3 text-sm text-slate-ink">
          <strong className="text-navy">
            Drafted {done.length} sheet{done.length === 1 ? "" : "s"}.
          </strong>{" "}
          {days(done.reduce((s, g) => s + g.dayValue, 0))} days across{" "}
          {done.reduce((s, g) => s + g.days, 0)} dated entries,{" "}
          {sar(done.reduce((s, g) => s + g.total, 0))} SAR in total. Each one is the record sheet turned into a claim — check it against what the
          trainer says before it is signed.{" "}
          <span className="font-medium text-navy">
            Each has joined the month with its own tab above and is verified, corrected and paid
            exactly like a sheet a trainer sent.
          </span>
          {done.some((g) => g.notes.length > 0) && (
            <ul className="mt-2 space-y-0.5 border-l border-hairline ps-3 text-[11px]">
              {done.flatMap((g) =>
                g.notes.map((n, i) => (
                  <li key={`${g.instructor}-${i}`}>
                    <span className="font-bold text-navy">{g.instructor}</span> — {n}
                  </li>
                )),
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
