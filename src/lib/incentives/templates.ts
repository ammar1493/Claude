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
 * something is generated. They travel as base64 in one .json because the
 * artifact host serves scripts, styles, images and data \u2014 and a workbook is
 * none of those.
 */

export type TemplateName = "incentive-form" | "monthly-incentives";

const FILES: Record<TemplateName, { label: string }> = {
  "incentive-form": { label: "NE-HR050 Training Operations Incentive Form 2026" },
  "monthly-incentives": { label: "Monthly Incentives — Instructors" },
};

/*
 * One copy per page load. The same blank is read for every sheet drafted in a
 * month, and re-fetching it twelve times would be the slowest thing the page
 * does.
 */
let pack: Promise<Record<string, string>> | null = null;

function decode(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export function templateLabel(name: TemplateName): string {
  return FILES[name].label;
}

export async function loadTemplate(name: TemplateName): Promise<ArrayBuffer> {
  if (!pack) {
    pack = (async () => {
      const res = await fetch(`${ASSET_BASE}templates/index.json`);
      if (!res.ok) throw new Error(`the page was served without its template files (${res.status})`);
      return (await res.json()) as Record<string, string>;
    })();
    // A failed fetch must not be remembered as the answer, or one hiccup would
    // break generating for the rest of the session.
    pack.catch(() => {
      pack = null;
    });
  }

  try {
    const files = await pack;
    const base64 = files[name];
    if (!base64) throw new Error("it is not in the pack");
    return decode(base64);
  } catch (e) {
    throw new Error(
      `The built-in ${FILES[name].label} could not be loaded: ${(e as Error).message}.`,
    );
  }
}
