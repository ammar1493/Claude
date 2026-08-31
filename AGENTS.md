<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project conventions

## Shipping

`main` is the production branch; Vercel deploys every push to it. The repo
owner has standing approval for this, so finishing a change means committing on
`claude/r-app-dashboard-vercel-nclum7`, pushing it, and then fast-forwarding
`main` to the same commit — no need to ask each time. Verify it is a
fast-forward first; never force-push `main`.

## Reading the data

The training workbook is uploaded in the browser on each visit and kept in
IndexedDB, so a stale upload, not the code, is the usual cause of a total that
looks wrong. The workbook bar above every tab states the file, its row count and
the date span it actually covers — check that before investigating a number.

Rows flagged in the workbook's `Duplicates` column are real and are counted like
any other. Nothing filters on that column.

## Charts

Chart label collisions are checked by measuring intersecting text bounding boxes
in the rendered SVG rather than by eye, across several viewport widths.
