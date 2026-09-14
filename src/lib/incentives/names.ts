/**
 * Instructor-name matching.
 *
 * The Record Sheet and the trainers' own sheets rarely agree on a name:
 * "Ahmed Ibrahim Aboubakr" signs a sheet the Record Sheet files under
 * "Ahmed Abubakr", "ASIF FARID" against "Asif Farid Israr Ulhaq",
 * "Mohamed Mansour" against "Mohammed mohammed mansour". Middle names come and
 * go and Arabic transliteration varies on every vowel.
 *
 * So names are compared on their consonant skeleton — the first letter plus
 * every consonant after it, doubles collapsed. That folds the vowel spellings
 * (MOHAMED / MOHAMMED / MUHAMMAD all become MHMD) while keeping distinct names
 * apart, and matching then only has to ask how many name parts two spellings
 * share.
 */

const VOWELS = /[AEIOUY]/g;

/*
 * Built from strings rather than written as literals.
 *
 * A bundler prints a regex literal verbatim, so a combining-mark range ends up
 * as raw UTF-8 in the output; served without a charset it decodes as latin-1
 * and the range becomes invalid, which throws before the page mounts. Inside a
 * string the escapes survive whatever the bundler and the host do.
 */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
const NOT_NAME_CHARS = new RegExp("[^A-Za-z\\u00C0-\\u024F\\s'-]", "g");

export function skeleton(token: string): string {
  const t = token
    .toUpperCase()
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .replace(/[^A-Z]/g, "");
  if (!t) return "";
  const rest = t.slice(1).replace(VOWELS, "");
  return (t[0] + rest).replace(/(.)\1+/g, "$1");
}

/** Name parts, minus the connectors that only sometimes get written. */
export function nameTokens(name: string): string[] {
  return String(name ?? "")
    .replace(NOT_NAME_CHARS, " ")
    // "Al-Eid" and "Al Eid" must reduce to the same token as "Aleid".
    .replace(/\b(AL|EL|ABD|ABU|BIN|IBN)[\s-]+/gi, "$1")
    .split(/[\s'-]+/)
    .map(skeleton)
    .filter((t) => t.length >= 2 && !/^(BIN|IBN|VAN|DE|DA)$/.test(t));
}

function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // "ABDLH" vs "ABDLHHSN": a written-out first name against a compound one.
  if (long.startsWith(short) && short.length >= 4) return true;
  if (short.length >= 5 && levenshtein(a, b) <= 1) return true;
  return false;
}

function levenshtein(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const next = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        diag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diag = prev[j];
      prev[j] = next;
    }
  }
  return prev[b.length];
}

/**
 * 0 to 1. The share of the shorter name's parts that the longer name also
 * carries — so dropping middle names costs nothing, but a different family
 * name costs everything.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const pool = [...long];
  let matched = 0;
  for (const t of short) {
    const i = pool.findIndex((p) => tokensMatch(t, p));
    if (i >= 0) {
      matched += 1;
      pool.splice(i, 1);
    }
  }
  // One shared part out of two is a coincidence ("Ahmed"); insist on two
  // unless the written name genuinely has only one part.
  if (short.length >= 2 && matched < 2) return matched / short.length / 2;
  return matched / short.length;
}

export interface NameMatch {
  name: string;
  score: number;
}

/**
 * Best Record Sheet spelling for a name written on an incentive sheet.
 * Returns null when nothing clears the bar or when two candidates are too
 * close to separate — a wrong join is worse than an unmatched sheet.
 */
export function matchInstructor(written: string, candidates: string[]): NameMatch | null {
  const scored = candidates
    .map((name) => ({ name, score: nameSimilarity(written, name) }))
    .sort((x, y) => y.score - x.score);
  const best = scored[0];
  if (!best || best.score < 0.6) return null;
  const runnerUp = scored.find((s) => s.name !== best.name);
  if (runnerUp && best.score - runnerUp.score < 0.15 && runnerUp.score >= 0.6) return null;
  return best;
}
