"use client";

import { useCallback, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useDashboard } from "@/state/DashboardContext";
import { Icon, type IconName } from "./Icons";
import { Sidebar } from "./Sidebar";
import { WorkbookDropzone } from "./WorkbookDropzone";
import { ExecutiveSummary } from "./tabs/ExecutiveSummary";
import { Hse } from "./tabs/Hse";
import { Qiddiya } from "./tabs/Qiddiya";
import { QualityMetrics } from "./tabs/QualityMetrics";
import { RawDataTable } from "./tabs/RawDataTable";
import { Takamol } from "./tabs/Takamol";
import { WellSharp } from "./tabs/WellSharp";
import { YearOverYear } from "./tabs/YearOverYear";

const TABS: { id: string; label: string; icon: IconName }[] = [
  { id: "exec", label: "Executive Summary", icon: "gauge" },
  { id: "yoy", label: "Year-over-Year", icon: "chart-line" },
  { id: "hse", label: "HSE", icon: "shield" },
  { id: "wellsharp", label: "WellSharp", icon: "hard-hat" },
  { id: "qiddiya", label: "Qiddiya Academy", icon: "building" },
  { id: "takamol", label: "Takamol", icon: "handshake" },
  { id: "quality", label: "Quality Metrics", icon: "star" },
  { id: "data", label: "Data Table", icon: "table" },
];

/** Tabs that read the training workbook and cannot render without it. */
const NEEDS_DATASET = new Set(["exec", "yoy", "hse", "wellsharp", "data"]);

export function Dashboard() {
  const [active, setActive] = useState("exec");
  const [projectScope, setProjectScope] = useState<"all" | "period">("all");
  const { dataset, toasts, dismissToast } = useDashboard();

  const print = useCallback(() => window.print(), []);
  const noData = dataset.status !== "ready";

  return (
    <div className="min-h-screen [--nav-h:64px]">
      {/*
        Top bar stays white: the guidelines allow the full-colour mark on white
        and light neutrals only, and reserve the knockout version for navy.
      */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-white">
        <div className="flex h-(--nav-h) flex-wrap items-center gap-3 px-4">
          <img src={BRAND.logo} alt="NEFT Energies" className="h-9 w-auto shrink-0" />
          <span className="text-base font-bold tracking-tight text-navy sm:text-lg">
            NEFT Training Analytics
          </span>
          <nav className="no-print ml-auto flex flex-wrap gap-0.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                aria-current={active === t.id ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
                  active === t.id
                    ? "bg-navy text-white"
                    : "text-slate-ink hover:bg-navy-050 hover:text-navy"
                }`}
              >
                <Icon name={t.icon} size={15} />
                <span className="hidden lg:inline">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">
        <Sidebar onPrint={print} />

        <main className="min-w-0 flex-1 px-4 py-6 lg:h-[calc(100vh-var(--nav-h))] lg:overflow-y-auto">
          {dataset.status === "loading" && (
            <p className="mb-4 rounded-lg border-l-4 border-l-navy bg-white px-4 py-3 text-sm text-slate-ink ring-1 ring-hairline">
              Loading the training workbook…
            </p>
          )}

          {noData && dataset.status !== "loading" && NEEDS_DATASET.has(active) ? (
            <WorkbookDropzone note={dataset.error} />
          ) : (
            <>
              {active === "exec" && (
                <ExecutiveSummary projectScope={projectScope} onProjectScopeChange={setProjectScope} />
              )}
              {active === "yoy" && <YearOverYear />}
              {active === "hse" && <Hse />}
              {active === "wellsharp" && <WellSharp />}
              {active === "qiddiya" && <Qiddiya />}
              {active === "takamol" && <Takamol />}
              {active === "quality" && <QualityMetrics />}
              {active === "data" && <RawDataTable />}
            </>
          )}

          <footer className="mt-10 flex flex-col items-center gap-3 border-t border-hairline pt-6 text-center text-xs text-slate-ink">
            <img src={BRAND.logo} alt="" aria-hidden className="h-7 w-auto opacity-70" />
            <p>
              {BRAND.name} · Training Analytics · {new Date().getFullYear()}
            </p>
          </footer>
        </main>
      </div>

      {/* showNotification() equivalent */}
      <div
        role="status"
        aria-live="polite"
        className="no-print pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg border-l-4 bg-white px-4 py-3 text-sm text-navy ring-1 ring-hairline ${
              t.tone === "error"
                ? "border-l-[#B3261E]"
                : t.tone === "warning"
                  ? "border-l-gold"
                  : "border-l-teal"
            }`}
          >
            <span className="flex-1">{t.message}</span>
            <button type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
