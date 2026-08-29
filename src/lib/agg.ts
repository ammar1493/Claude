/** Small dplyr-flavoured helpers used across the dashboard. */

export function groupBy<T, K extends string | number>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const bucket = out.get(k);
    if (bucket) bucket.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** dplyr::n_distinct() — NA/blank values are dropped, matching the R default. */
export function nDistinct<T>(values: T[]): number {
  const seen = new Set<unknown>();
  for (const v of values) {
    if (v === null || v === undefined || v === "") continue;
    seen.add(v);
  }
  return seen.size;
}

export function sumBy<T>(rows: T[], value: (r: T) => number): number {
  let total = 0;
  for (const r of rows) {
    const v = value(r);
    if (Number.isFinite(v)) total += v;
  }
  return total;
}

export function maxBy<T>(rows: T[], value: (r: T) => number): number {
  let best = -Infinity;
  for (const r of rows) {
    const v = value(r);
    if (Number.isFinite(v) && v > best) best = v;
  }
  return best === -Infinity ? 0 : best;
}

/** arrange(desc(x)) then head(n) */
export function topN<T>(rows: T[], value: (r: T) => number, n: number): T[] {
  return [...rows].sort((a, b) => value(b) - value(a)).slice(0, n);
}

/** slice(from:to) on a descending-sorted list, 1-indexed like dplyr::slice(). */
export function sliceRange<T>(rows: T[], from: number, to: number): T[] {
  return rows.slice(from - 1, to);
}

/**
 * Horizontal plotly bars read bottom-to-top, so the R code sorts ascending
 * before plotting. Same idea here.
 */
export function ascending<T>(rows: T[], value: (r: T) => number): T[] {
  return [...rows].sort((a, b) => value(a) - value(b));
}
