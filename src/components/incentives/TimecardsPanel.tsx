"use client";

import { useRef, useState } from "react";
import { describeTimecard, newTimecard, spanDays } from "@/lib/incentives/timecards";
import type { SiteKind, Timecard } from "@/lib/incentives/types";
import { Card } from "../Card";
import { Icon } from "../Icons";
import { SEVERITY } from "./severity";

const KIND_LABELS: Record<SiteKind, string> = {
  rig: "Rig or well — top band",
  site: "Outbound site — priced on km",
  centre: "NEFT centre / office",
  unknown: "Not set",
};

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold tracking-wide text-slate-ink uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-0.5 block text-[11px] text-slate-ink">{hint}</span>}
    </label>
  );
}

const inputClass =
  "mt-1 w-full rounded-md border border-hairline bg-white px-2 py-1.5 text-sm text-navy outline-none focus:border-gold focus:ring-2 focus:ring-gold/30";

/**
 * Assessor timecards.
 *
 * A fortnight of rig competency assessment issues no certificates, so the
 * record sheet has nothing for it and the days read as unsupported claim. The
 * signed card is the evidence instead.
 *
 * The cards come back as signed scans — a photograph of a table — so they are
 * typed in rather than read automatically, with the scan attached beside them.
 * Six fields is a small price for a number nobody has to take on trust.
 */
export function TimecardsPanel({
  timecards,
  onChange,
  onAttach,
  onOpenAttachment,
  instructors,
}: {
  timecards: Timecard[];
  onChange: (next: Timecard[]) => void;
  onAttach: (card: Timecard, file: File) => Promise<void>;
  onOpenAttachment: (card: Timecard) => void;
  instructors: string[];
}) {
  const [draft, setDraft] = useState<Timecard | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const startNew = () => {
    setPendingFile(null);
    setDraft(newTimecard());
  };

  const save = async () => {
    if (!draft) return;
    const card = { ...draft, attachmentName: pendingFile?.name ?? draft.attachmentName };
    const exists = timecards.some((t) => t.id === card.id);
    onChange(exists ? timecards.map((t) => (t.id === card.id ? card : t)) : [...timecards, card]);
    if (pendingFile) await onAttach(card, pendingFile);
    setDraft(null);
    setPendingFile(null);
  };

  const remove = (id: string) => onChange(timecards.filter((t) => t.id !== id));

  const valid = draft && draft.assessor.trim() && spanDays(draft) > 0;

  return (
    <div className="space-y-4">
      <div className="stage stage-1 surface-card rounded-xl border-l-4 border-l-gold bg-white px-4 py-3">
        <h2 className="text-sm font-bold text-navy">Work that issues no certificates</h2>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-ink">
          Competency assessment on a rig, and the report writing after it, produce no certificates,
          so the record sheet has nothing to show for them and those days read as unsupported claim.
          Add the client-signed timecard here and its days count as evidence, at the band the unit
          sits in. If the record sheet also shows classroom teaching on a day a card covers, the
          report says so rather than picking one.
        </p>
      </div>

      <Card
        title={`Timecards (${timecards.length})`}
        tone="marked"
        inset
        action={
          !draft && (
            <button
              type="button"
              onClick={startNew}
              className="no-print flex items-center gap-1.5 rounded-md bg-gold px-2.5 py-1 text-xs font-bold text-navy transition-[filter,scale] duration-150 ease-out hover:brightness-105 active:scale-[0.96]"
            >
              <Icon name="plus" size={13} />
              Add a timecard
            </button>
          )
        }
      >
        {timecards.length === 0 && !draft && (
          <p className="py-6 text-center text-sm text-slate-ink">
            No timecards yet. Add one when a trainer claims days that the record sheet cannot show.
          </p>
        )}

        {timecards.length > 0 && (
          <div className="neft-scroll overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-[11px] font-bold tracking-wide text-slate-ink uppercase">
                  <th className="border-b border-hairline px-2 py-2">Assessor</th>
                  <th className="border-b border-hairline px-2 py-2">Unit</th>
                  <th className="border-b border-hairline px-2 py-2">Activity</th>
                  <th className="border-b border-hairline px-2 py-2">Dates</th>
                  <th className="border-b border-hairline px-2 py-2 text-right">Days</th>
                  <th className="border-b border-hairline px-2 py-2">Band</th>
                  <th className="border-b border-hairline px-2 py-2">Scan</th>
                  <th className="no-print border-b border-hairline px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {timecards.map((card) => {
                  const span = spanDays(card);
                  const mismatch = card.totalDays !== null && card.totalDays !== span;
                  return (
                    <tr key={card.id} className={mismatch ? SEVERITY.warning.row : undefined}>
                      <td className="border-b border-hairline px-2 py-1.5 font-bold text-navy">
                        {card.assessor}
                        {card.provider && (
                          <span className="block text-[11px] font-normal text-slate-ink">
                            {card.provider}
                          </span>
                        )}
                      </td>
                      <td className="border-b border-hairline px-2 py-1.5 text-navy">{card.unit}</td>
                      <td className="border-b border-hairline px-2 py-1.5 text-slate-ink">
                        {card.activity}
                      </td>
                      <td className="border-b border-hairline px-2 py-1.5 whitespace-nowrap text-slate-ink">
                        {card.start} → {card.end}
                      </td>
                      <td className="border-b border-hairline px-2 py-1.5 text-right tabular-nums text-navy">
                        {span}
                        {mismatch && (
                          <span className="ms-1 text-[11px] text-[#7A4F06]">(card says {card.totalDays})</span>
                        )}
                      </td>
                      <td className="border-b border-hairline px-2 py-1.5 text-xs text-slate-ink">
                        {KIND_LABELS[card.kind]}
                        {card.kind === "site" && card.km !== null ? ` · ${card.km} km` : ""}
                      </td>
                      <td className="border-b border-hairline px-2 py-1.5 text-xs">
                        {card.attachmentName ? (
                          <button
                            type="button"
                            onClick={() => onOpenAttachment(card)}
                            className="max-w-[180px] truncate text-navy underline decoration-hairline underline-offset-2 hover:decoration-gold"
                            title={card.attachmentName}
                          >
                            {card.attachmentName}
                          </button>
                        ) : (
                          <span className="text-slate-ink/60">none</span>
                        )}
                      </td>
                      <td className="no-print border-b border-hairline px-2 py-1.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          aria-label={`Edit the ${card.unit} timecard`}
                          onClick={() => {
                            setPendingFile(null);
                            setDraft(card);
                          }}
                          className="rounded p-1 text-slate-ink hover:bg-navy-050 hover:text-navy"
                        >
                          <Icon name="pencil" size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove the ${card.unit} timecard`}
                          onClick={() => remove(card.id)}
                          className="rounded p-1 text-slate-ink hover:bg-navy-050 hover:text-navy"
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
        )}

        {draft && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            className="mt-3 rounded-xl border border-hairline bg-fog p-3"
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Assessor" hint="As the card names them.">
                <input
                  list="timecard-instructors"
                  required
                  value={draft.assessor}
                  onChange={(e) => setDraft({ ...draft, assessor: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <datalist id="timecard-instructors">
                {instructors.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <Field label="Provider">
                <input
                  value={draft.provider}
                  placeholder="NEFT Energies"
                  onChange={(e) => setDraft({ ...draft, provider: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Unit" hint="The rig, vessel or place.">
                <input
                  value={draft.unit}
                  placeholder="ADM-687"
                  onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Activity">
                <input
                  value={draft.activity}
                  placeholder="Competency assessment"
                  onChange={(e) => setDraft({ ...draft, activity: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Start date">
                <input
                  type="date"
                  required
                  value={draft.start}
                  onChange={(e) => setDraft({ ...draft, start: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="End date" hint="Both ends counted, as the card counts them.">
                <input
                  type="date"
                  required
                  value={draft.end}
                  onChange={(e) => setDraft({ ...draft, end: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Days on the card" hint={draft.start && draft.end ? `The dates span ${spanDays(draft)}.` : undefined}>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={draft.totalDays ?? ""}
                  placeholder="8"
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    const n = raw === "" ? null : Number(raw);
                    setDraft({ ...draft, totalDays: n === null || Number.isNaN(n) ? null : n });
                  }}
                  className={inputClass}
                />
              </Field>
              <Field label="Pays at">
                <select
                  value={draft.kind}
                  onChange={(e) => {
                    const kind = e.target.value as SiteKind;
                    setDraft({ ...draft, kind, km: kind === "centre" ? 0 : kind === "rig" ? null : draft.km });
                  }}
                  className={inputClass}
                >
                  {(["rig", "site", "centre"] as SiteKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </Field>
              {draft.kind === "site" && (
                <Field label="km from NEFT">
                  <input
                    type="number"
                    min={0}
                    value={draft.km ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      const n = raw === "" ? null : Number(raw);
                      setDraft({ ...draft, km: n === null || Number.isNaN(n) ? null : n });
                    }}
                    className={inputClass}
                  />
                </Field>
              )}
              <Field label="Signed scan" hint="Kept in this browser as the audit trail.">
                <input
                  ref={fileInput}
                  type="file"
                  accept=".pdf,image/*"
                  onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-xs text-slate-ink file:mr-2 file:rounded-md file:border-0 file:bg-navy file:px-2 file:py-1 file:text-xs file:font-bold file:text-white"
                />
              </Field>
              <Field label="Note">
                <input
                  value={draft.note}
                  placeholder="Signed by OIM, 17 Aug"
                  onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!valid}
                className="rounded-md bg-gold px-4 py-2 text-sm font-bold text-navy transition-[filter,scale] duration-150 ease-out hover:brightness-105 active:scale-[0.96] disabled:opacity-50 disabled:active:scale-100"
              >
                Save timecard
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setPendingFile(null);
                }}
                className="rounded-md px-3 py-2 text-sm font-medium text-slate-ink hover:text-navy"
              >
                Cancel
              </button>
              {draft.start && draft.end && spanDays(draft) <= 0 && (
                <span className="text-xs font-bold text-[#B3261E]">
                  The end date has to be on or after the start date.
                </span>
              )}
              {valid && <span className="text-xs text-slate-ink">{describeTimecard(draft)}</span>}
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
