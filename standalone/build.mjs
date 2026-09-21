import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "standalone", "dist");
mkdirSync(out, { recursive: true });

await build({
  entryPoints: [path.join(root, "standalone/entry.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  // Escape every non-ASCII byte. The page carries em dashes, a tick and a
  // combining-mark range inside a regular expression; served by a host that
  // omits the charset, those decode as latin-1 and the regex throws before
  // anything mounts. Escapes are immune to how the file is served.
  charset: "ascii",
  jsx: "automatic",
  loader: { ".png": "dataurl", ".gif": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"', __ASSET_BASE__: '""' },
  outfile: path.join(out, "app.js"),
  alias: { "@": path.join(root, "src") },
  logLevel: "info",
});

// The booking platform is the second page of the same bundle: its own script
// and document, sharing the one stylesheet and the one logo.
await build({
  entryPoints: [path.join(root, "standalone/bookings.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2022"],
  charset: "ascii",
  jsx: "automatic",
  loader: { ".png": "dataurl", ".gif": "dataurl" },
  define: { "process.env.NODE_ENV": '"production"', __ASSET_BASE__: '""' },
  outfile: path.join(out, "bookings.js"),
  alias: { "@": path.join(root, "src") },
  logLevel: "info",
});

// Tailwind v4 scans from the CSS file's own directory, so the entry lives at
// the repo root where src/ is visible to it.
execSync(
  `npx @tailwindcss/cli -i ${path.join(root, "standalone/styles.css")} -o ${path.join(out, "styles.css")} --minify`,
  { cwd: root, stdio: "inherit" },
);

mkdirSync(path.join(out, "brand"), { recursive: true });
copyFileSync(path.join(root, "public/brand/neft-logo.png"), path.join(out, "brand/neft-logo.png"));
copyFileSync(path.join(root, "standalone/index.html"), path.join(out, "index.html"));
copyFileSync(path.join(root, "standalone/bookings.html"), path.join(out, "bookings.html"));

// The blank NE-HR050 form and the incentives letter, packed as base64 in one
// .json: they are fetched at run time rather than bundled, and the artifact
// host will not serve a .xlsx.
execSync("node scripts/build-templates.mjs", { cwd: root, stdio: "inherit" });
mkdirSync(path.join(out, "templates"), { recursive: true });
copyFileSync(
  path.join(root, "public/templates/index.json"),
  path.join(out, "templates/index.json"),
);

const size = (f) => (readFileSync(path.join(out, f)).length / 1024).toFixed(0);
console.log(
  `app.js ${size("app.js")} KB · bookings.js ${size("bookings.js")} KB · styles.css ${size("styles.css")} KB`,
);
