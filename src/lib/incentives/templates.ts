import { ASSET_BASE } from "../brand";

/**
 * The blank forms the office works from.
 *
 * Both used to be uploaded: the incentive sheet was borrowed from whichever
 * trainer had already sent one, and the letter from last month's copy. Neither
 * is a thing the verifier should have to be given. NE-HR050 is the company's
 * own form and it is the same every month, so it ships with the app and a
 * drafted sheet is written on the real blank rather than on someone else's
 * claim with the ticks rubbed out.
 *
 * They are fetched rather than inlined: together they are 400 KB, which is
 * half the size of the whole bundle again, and neither is needed until
 * something is generated.
 */

export type TemplateName = "incentive-form" | "monthly-incentives";

const FILES: Record<TemplateName, { path: string; label: string }> = {
  "incentive-form": {
    path: "templates/incentive-form.xlsx",
    label: "NE-HR050 Training Operations Incentive Form 2026",
  },
  "monthly-incentives": {
    path: "templates/monthly-incentives.docx",
    label: "Monthly Incentives — Instructors",
  },
};

/* One copy per page load. The same blank is read for every sheet drafted in a
   month, and re-fetching it twelve times would be the slowest thing the page
   does. */
const cache = new Map<TemplateName, Promise<ArrayBuffer>>();

export function templateLabel(name: TemplateName): string {
  return FILES[name].label;
}

export async function loadTemplate(name: TemplateName): Promise<ArrayBuffer> {
  const hit = cache.get(name);
  if (hit) return hit;

  const file = FILES[name];
  const pending = (async () => {
    const res = await fetch(`${ASSET_BASE}${file.path}`);
    if (!res.ok) {
      throw new Error(
        `The built-in ${file.label} could not be loaded (${res.status}). It ships with the app, so this means the page was served without its template files.`,
      );
    }
    return res.arrayBuffer();
  })();

  // A failed fetch must not be remembered as the answer, or a hiccup would
  // break generating for the rest of the session.
  cache.set(name, pending);
  pending.catch(() => cache.delete(name));
  return pending;
}
