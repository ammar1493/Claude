"use client";

import { useCallback, useState } from "react";
import { BRAND } from "@/lib/brand";
import { useDashboard } from "@/state/DashboardContext";
import { Icon, type IconName } from "./Icons";
import { Sidebar } from "./Sidebar";
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

export function Dashboard() {
  const [active, setActive] = useState("exec");
  const [projectScope, setProjectScope] = useState<"all" | "period">("all");
  const { dataset, toasts, dismissToast } = useDashboard();

  const print = useCallback(() => window.print(), []);

  return (
    <div className="min-h-screen">
      {/* Navbar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2">
          <img src={BRAND.logo} alt="NEFT" className="h-9 w-auto" />
          <span className="text-lg font-bold text-navy sm:text-xl">{BRAND.appTitle}</span>
          <nav className="no-print ml-auto flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActive(t.id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  active === t.id
                    ? "bg-navy text-white"
                    : "text-navy/70 hover:bg-navy/5 hover:text-navy"
                }`}
              >
                <Icon name={t.icon} size={15} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row">
        <Sidebar onPrint={print} />

        <main className="min-w-0 flex-1 px-4 py-6 lg:h-[calc(100vh-64px)] lg:overflow-y-auto">
          {dataset.status === "loading" && <Banner tone="info">Loading the training workbook…</Banner>}
          {dataset.status === "empty" && (
            <Banner tone="warning">
              No training data yet. {dataset.error} Use <strong>Upload workbook</strong> in the sidebar to
              load an .xlsx with the columns: Actual Date, Course Name, Client, Instructor Name,
              Participant&rsquo;s Name, Actual Sessions.
            </Banner>
          )}
          {dataset.status === "error" && <Banner tone="error">{dataset.error}</Banner>}

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

          <footer className="mt-10 flex flex-col items-center gap-3 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
            <img
              src={BRAND.sloganSequence}
              alt="Be trained. Be certified. Be successful."
              className="h-14 w-auto rounded-lg bg-white px-3 py-1 ring-1 ring-slate-200"
            />
            <p>NEFT Training Analytics · {new Date().getFullYear()}</p>
          </footer>
        </main>
      </div>

      {/* Notifications (showNotification equivalent) */}
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ring-1 ${
              t.tone === "error"
                ? "bg-red-50 text-red-900 ring-red-200"
                : t.tone === "warning"
                  ? "bg-amber-50 text-amber-900 ring-amber-200"
                  : "bg-white text-navy ring-slate-200"
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

function Banner({ tone, children }: { tone: "info" | "warning" | "error"; children: React.ReactNode }) {
  const tones = {
    info: "bg-sky-50 text-sky-900 ring-sky-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-200",
    error: "bg-red-50 text-red-900 ring-red-200",
  } as const;
  return <div className={`mb-4 rounded-lg px-4 py-3 text-sm ring-1 ${tones[tone]}`}>{children}</div>;
}
