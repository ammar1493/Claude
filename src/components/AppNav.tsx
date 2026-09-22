"use client";

import { BRAND, HAS_DASHBOARD } from "@/lib/brand";
import { Icon, type IconName } from "./Icons";

/**
 * The navigation the three sections share.
 *
 * There are two questions a header has to answer and they were being asked on
 * one line: which of the three sections am I in, and which view of it am I
 * looking at. Ten items in a 64px bar wrapped and spilled out of it at every
 * width between 1024 and 1600 — which is most laptops — so the answers are on
 * two rows now. The sections sit in the bar with the mark; the views sit under
 * it, grouped, and scroll sideways rather than ever wrapping again.
 */

export type Section = "dashboard" | "bookings" | "incentives";

const SECTIONS: { id: Section; href: string; label: string; icon: IconName }[] = [
  { id: "dashboard", href: "/", label: "Dashboard", icon: "gauge" },
  { id: "bookings", href: "/bookings", label: "Booking & Scheduling", icon: "calendar-check" },
  { id: "incentives", href: "/incentives", label: "Incentive Verification", icon: "check-circle" },
];

/**
 * The way to the other two sections.
 *
 * Its own export because the verifier's header carries a month chip and four
 * actions and wraps on purpose, so it keeps its own layout and takes only the
 * links — which is the part that has to stay identical across the three.
 */
export function SectionLinks({ current }: { current: Section }) {
  if (!HAS_DASHBOARD) return null;
  return (
    <>
      {SECTIONS.filter((s) => s.id !== current).map((s) => (
        <a
          key={s.id}
          href={s.href}
          className="flex items-center gap-1.5 rounded-md border border-hairline px-2.5 py-1.5 text-[13px] font-medium text-slate-ink transition-[color,background-color,scale] duration-150 ease-out hover:bg-navy-050 hover:text-navy active:scale-[0.96]"
        >
          <Icon name={s.icon} size={15} />
          <span className="hidden md:inline">{s.label}</span>
        </a>
      ))}
    </>
  );
}

/**
 * The bar: the mark, what this section is called, and the way to the other two.
 *
 * The standalone build hosts one page, so the links would go nowhere and are
 * left out of it entirely.
 */
export function AppBar({
  current,
  title,
  children,
}: {
  current: Section;
  title: string;
  /** Controls belonging to this section, shown before the section links. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-(--nav-h) items-center gap-3 px-4">
      <img src={BRAND.logo} alt="NEFT Energies" className="h-9 w-auto shrink-0" />
      <span className="truncate text-base font-bold tracking-tight text-navy sm:text-lg">
        {title}
      </span>
      <div className="no-print ms-auto flex items-center gap-1">
        {children}
        <SectionLinks current={current} />
      </div>
    </div>
  );
}

/**
 * One group of views. A group is a heading the office would recognise — the
 * summaries, the programmes it runs, the checks on them — so eight tabs read
 * as three ideas rather than eight.
 */
export interface TabGroup<T extends string> {
  /** Shown on wide screens above the group; the rule alone carries it below. */
  label: string;
  tabs: { id: T; label: string; icon: IconName }[];
}

export function TabBar<T extends string>({
  groups,
  active,
  onSelect,
  badges,
}: {
  groups: TabGroup<T>[];
  active: T;
  onSelect: (id: T) => void;
  /** A count to show against a tab, for anything that needs attention. */
  badges?: Partial<Record<T, number>>;
}) {
  return (
    <div className="no-print neft-scroll overflow-x-auto border-t border-hairline bg-white">
      <nav className="flex w-max min-w-full items-stretch gap-0.5 px-4 py-1.5">
        {groups.map((group, index) => (
          <div key={group.label} className="flex items-center gap-0.5">
            {index > 0 && (
              <span
                aria-hidden
                className="mx-1.5 h-5 w-px shrink-0 self-center rounded-full bg-hairline"
              />
            )}
            {group.tabs.map((t) => {
              const count = badges?.[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t.id)}
                  aria-current={active === t.id ? "page" : undefined}
                  title={t.label}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-[color,background-color,scale] duration-150 ease-out active:scale-[0.96] ${
                    active === t.id
                      ? "bg-navy text-white"
                      : "text-slate-ink hover:bg-navy-050 hover:text-navy"
                  }`}
                >
                  <Icon name={t.icon} size={15} />
                  <span className="hidden lg:inline">{t.label}</span>
                  {count ? (
                    <span className="rounded-full bg-gold px-1.5 text-[11px] font-bold text-navy">
                      {count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );
}
