/**
 * NEFT brand configuration.
 * Ported 1:1 from the BRAND CONFIG block of app.R.
 */
export const NEFT_NAVY = "#002147";
export const NEFT_NAVY_LIGHT = "#003d7a";
export const NEFT_GOLD = "#FFC000";
export const HSE_COLOR = "#2E7D32";
export const QIDDIYA_COLOR = "#6A1B9A";
export const TAKAMOL_COLOR = "#00796B";

export const MUTED_BAR = "#6c757d";
export const DANGER = "#d32f2f";

export const BRAND = {
  name: "NEFT",
  appTitle: "NEFT Training Analytics",
  /** Animated logo used in the R app's navbar title. */
  remoteLogo:
    "https://neftenergies.com/wp-content/uploads/2022/07/neftanimated700x420.gif",
  /** Local copies of the brand assets committed to this repo. */
  logo: "/brand/neft-logo.gif",
  signature: "/brand/neft-signature.gif",
  sloganSequence: "/brand/neft-slogan-sequence.gif",
  sloganWords: "/brand/neft-slogan-words.gif",
} as const;

/** Plotly font stack matching the app's Inter base font. */
export const PLOT_FONT = {
  family: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
};

export const CHART_MARGIN_H = { l: 200, r: 100, t: 40, b: 50 };
export const CHART_MARGIN_V = { l: 70, r: 50, t: 50, b: 120 };
