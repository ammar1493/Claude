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

// Tailwind v4 scans from the CSS file's own directory, so the entry lives at
// the repo root where src/ is visible to it.
execSync(
  `npx @tailwindcss/cli -i ${path.join(root, "standalone/styles.css")} -o ${path.join(out, "styles.css")} --minify`,
  { cwd: root, stdio: "inherit" },
);

mkdirSync(path.join(out, "brand"), { recursive: true });
copyFileSync(path.join(root, "public/brand/neft-logo.png"), path.join(out, "brand/neft-logo.png"));
copyFileSync(path.join(root, "standalone/index.html"), path.join(out, "index.html"));

const size = (f) => (readFileSync(path.join(out, f)).length / 1024).toFixed(0);
console.log(`app.js ${size("app.js")} KB · styles.css ${size("styles.css")} KB`);
