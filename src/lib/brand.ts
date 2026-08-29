/**
 * NEFT Energies brand system.
 * Values come from "Neft — Brand Guidelines", section 03 (Color Palette),
 * 04 (Typography) and 05 (Iconography).
 */

/** Navy — Primary. Carries all primary surfaces and headline text. */
export const NEFT_NAVY = "#001A45";
/** Gold — Primary Accent. Single accents only: CTAs, section markers, key figures. */
export const NEFT_GOLD = "#F5A623";
/** Teal — Secondary. Data visualization and gradient echoes of the mark. */
export const NEFT_TEAL = "#0E6472";
/** Green — Tertiary. Data visualization only. */
export const NEFT_GREEN = "#8DC63F";
/** Fog — Background. */
export const NEFT_FOG = "#F6F7F9";
/** Slate — supporting text and neutral series. */
export const NEFT_SLATE = "#5B6472";

/**
 * Section colours. The guidelines reserve gold for small accents and keep teal
 * and green inside data visualization, so a section is identified by its chart
 * series colour rather than by a coloured header bar.
 */
export const HSE_COLOR = NEFT_TEAL;
export const QIDDIYA_COLOR = NEFT_TEAL;
export const TAKAMOL_COLOR = NEFT_GREEN;

export const MUTED_BAR = NEFT_SLATE;
export const DANGER = "#B3261E";

export const BRAND = {
  name: "NEFT Energies",
  appTitle: "NEFT Training Analytics",
  /**
   * The supplied asset is the icon mark (gear + NE), not the full lockup, so
   * the 120px full-lockup minimum in section 02 does not apply to it — that
   * section in fact directs you to the icon mark alone at small sizes.
   * Full colour on white and light neutrals only; never on navy or gold.
   */
  logo: "/brand/neft-logo.png",
  /** Same mark, animated. Kept for surfaces where the build-on reads well. */
  logoAnimated: "/brand/neft-logo.gif",
  signature: "/brand/neft-signature.gif",
  sloganSequence: "/brand/neft-slogan-sequence.gif",
  sloganWords: "/brand/neft-slogan-words.gif",
} as const;

/** Tajawal carries both Latin and Arabic; headings 700-900, body & UI 400-500. */
export const PLOT_FONT = {
  family: "Tajawal, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
};

/**
 * Categorical series palette for charts. Navy leads, gold marks the single
 * highlighted series, teal and green fill in — the only place the guidelines
 * allow those two.
 */
export const SERIES_COLORS = [
  NEFT_NAVY,
  NEFT_GOLD,
  NEFT_TEAL,
  NEFT_GREEN,
  NEFT_SLATE,
  "#3A5C8A",
  "#C98A1E",
  "#1B8A9C",
  "#6FA32F",
  "#8A929E",
];

/** Hairline used for card edges and chart gridlines. */
export const HAIRLINE = "#E3E7ED";

export const CHART_MARGIN_H = { l: 200, r: 100, t: 40, b: 50 };
export const CHART_MARGIN_V = { l: 70, r: 50, t: 50, b: 120 };
