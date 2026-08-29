/** format(x, big.mark = ",") */
export function fmtInt(x: number | null | undefined): string {
  const n = Number(x ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}

/** Number with a fixed number of decimals, trailing ".0" preserved like R's round(). */
export function fmtNum(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return "0";
  return Number(x.toFixed(digits)).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

export function pct(part: number, whole: number, digits = 1): number {
  if (!whole) return 0;
  return Number(((part / whole) * 100).toFixed(digits));
}
