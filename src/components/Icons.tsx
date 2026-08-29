import type { SVGProps } from "react";

/**
 * A small stroke-icon set standing in for the bsicons / font-awesome glyphs
 * used by app.R, so the dashboard ships no icon-font dependency.
 */
export type IconName =
  | "gauge" | "chart-line" | "shield" | "hard-hat" | "building" | "handshake" | "star" | "table"
  | "people" | "calendar" | "calendar-check" | "speedometer" | "mortarboard" | "pie" | "diagram"
  | "clock" | "clock-history" | "graph-up" | "book" | "check-circle" | "download" | "refresh"
  | "plus" | "trash" | "info" | "trophy" | "leaf" | "award" | "filter" | "pencil" | "upload"
  | "printer" | "x" | "warning" | "arrow-up";

const PATHS: Record<IconName, string> = {
  gauge: "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm1.4-3.4L18 6M3 20a9 9 0 1 1 18 0",
  "chart-line": "M3 3v18h18M7 15l4-5 3 3 5-7",
  shield: "M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3Z",
  "hard-hat": "M4 16a8 8 0 0 1 16 0M9 16V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9M3 16h18v3H3z",
  building: "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M14 9h4a2 2 0 0 1 2 2v10M3 21h18M8 7h2M8 11h2M8 15h2M17 13h1M17 17h1",
  handshake: "m11 17 2 2a1 1 0 0 0 1.4 0l4.6-4.6a2 2 0 0 0 0-2.8L14 6H8L3 11l3.5 3.5M9 12l3 3",
  star: "m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5-4.7-4.6 6.5-.9L12 3Z",
  table: "M3 5h18v14H3zM3 10h18M9 10v9M15 10v9",
  people: "M16 19v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM21 19v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  calendar: "M3 6h18v15H3zM3 10h18M8 3v4M16 3v4",
  "calendar-check": "M3 6h18v15H3zM3 10h18M8 3v4M16 3v4M8.5 15l2.2 2.2L15.5 13",
  speedometer: "M12 20a8 8 0 1 1 8-8M12 12l4-3M20 12h1M3 12h1",
  mortarboard: "m2 8 10-4 10 4-10 4L2 8Zm4 3v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5",
  pie: "M12 3v9h9a9 9 0 1 1-9-9Z",
  diagram: "M9 4h6v4H9zM3 16h6v4H3zM15 16h6v4h-6zM12 8v4M6 16v-2h12v2",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2",
  "clock-history": "M12 7v5l3 2M3.5 9A9 9 0 1 1 3 13M3 4v5h5",
  "graph-up": "M3 20h18M6 16l4-5 3 2.5L19 6M19 6h-4M19 6v4",
  book: "M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4Zm0 0v13M18 7h2v13H7",
  "check-circle": "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-3.5-9 2.5 2.5L16 9",
  download: "M12 3v12m0 0-4-4m4 4 4-4M4 19h16",
  refresh: "M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5",
  plus: "M12 5v14M5 12h14",
  trash: "M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 7.5v.5",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 20h6M12 14v6",
  leaf: "M4 20c0-8 6-14 16-15 0 10-5 15-12 15H4Zm3-3c2-4 5-6 9-8",
  award: "M12 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm-3 .8L7 21l5-2 5 2-2-6.2",
  filter: "M3 5h18l-7 8v6l-4 2v-8L3 5Z",
  pencil: "M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z",
  upload: "M12 19V7m0 0-4 4m4-4 4 4M4 21h16",
  printer: "M7 9V3h10v6M7 19H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 15h10v6H7z",
  x: "M6 6l12 12M18 6 6 18",
  warning: "M12 4 2.5 20h19L12 4Zm0 6v5m0 2.5v.5",
  "arrow-up": "M12 19V5m0 0-6 6m6-6 6 6",
};

export function Icon({
  name,
  size = 18,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
