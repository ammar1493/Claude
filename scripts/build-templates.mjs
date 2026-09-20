import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Pack the blank forms into one JSON file the app can fetch.
 *
 * The .xlsx and .docx themselves stay in public/templates as the source of
 * truth — they are the office's own files and somebody will want to open one.
 * But the artifact host serves scripts, styles, images and data, and a
 * workbook is none of those, so the copy the browser actually loads is base64
 * inside a .json. Generated rather than committed: 550 KB of base64 in the
 * history, rewritten whenever the form changes, is not a diff anyone can read.
 */

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "public/templates");

const NAMES = {
  "incentive-form.xlsx": "incentive-form",
  "monthly-incentives.docx": "monthly-incentives",
};

const out = {};
for (const file of readdirSync(dir)) {
  const key = NAMES[file];
  if (!key) continue;
  out[key] = readFileSync(path.join(dir, file)).toString("base64");
}

const missing = Object.values(NAMES).filter((k) => !out[k]);
if (missing.length) {
  throw new Error(`public/templates is missing: ${missing.join(", ")}`);
}

const target = path.join(dir, "index.json");
writeFileSync(target, JSON.stringify(out));
const kb = (n) => (n / 1024).toFixed(0);
console.log(
  `templates/index.json ${kb(readFileSync(target).length)} KB ` +
    `(${Object.keys(out).join(", ")})`,
);
