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

## Incentive sheets

The `/incentives` verifier reads three workbooks and none of them is the
training workbook the dashboard tabs share, so it holds its own state. The
rules it applies, and why each is written the way it is, are in the README
under *Incentive verification*; the short version is that a day is valued from
the course list, sessions are grouped into classes before they are counted, and
anything the evidence cannot settle is reported rather than guessed.

Trainers fill these sheets by hand, so the parser matches on wording and not on
row numbers, and dates, names, session numbers and durations all arrive in
several spellings. Before changing a parsing rule, check it against every sheet
in a month rather than the one that prompted the change.

One course is settled by a rule of the office's rather than by the list: a
first-aid line naming SHA is the Saudi Heart Association course, the one full
day among the five, and a first-aid line that does not name it is a half day
(`narrowFirstAid`). It is not an inference from the data — do not "fix" it
back to reporting the ambiguity.

The form is NE-HR050 2026 and the app ships it, with the letter, in
`public/templates/` (`templates.ts` fetches them; `standalone/build.mjs`
copies them beside `app.js`). Nothing is uploaded to draft a sheet any more.
The 2025 sheets still parse — section headings and rate-line wording are
matched, not row numbers — and both forms are checked by the scripts before
any parsing rule changes.

Three rules about days are the office's, not inferences: a Friday or Saturday
claimed with no course behind it is standby at half the weekend rate (near
band only; the distance bands have their own standby line); two half-day
classes on a weekday go on the morning and afternoon lines rather than the
full-day line, which is worth the same; and a multi-day course is one log
line per day at Full Day, because the Duration column is a dropdown of
Half Day / Full Day / Outbound and "4 Days" is not one of them.

The freelance teaching allowance is quoted in **US dollars** ($75 a day,
$37.50 a half day) while every other figure in the app is in riyals, so
`FreelanceRates.sarPerUsd` converts it before it reaches a total — default
3.75, the peg, and editable. Anything that shows the allowance shows the
dollars and the conversion both; anything that adds it to another figure uses
the riyals.

Freelancers are priced by `freelanceTotal`, which **replaces** the staff rate
arithmetic rather than adjusting it — the finding carries no delta, and
`verifiedTotal` and `payableTotal` return it directly. Adding a delta on top
of the other corrections double-counts, which is exactly the bug that shipped
in the first draft of it.

Cell fills go through `StyleTable` (`xlsxEdit.ts`), which appends a cellXf
combining the cell's existing formatting with the new fill. Never rewrite an
existing xf: every other cell in the workbook indexes into that table. The
Friday/Saturday colours are lifted from the template's legend at H7/H8 of the
verification tab, so check there rather than inventing a hex.

Labels can be merged. `labelledField` skips past the label's own merged range
and resolves the answer to its merge anchor, because writing into the second
column of a merged label is writing into a cell Excel never draws.

The month's letter (`summaryDoc.ts`) is written the same way: the office's own
`.docx` with its table rows replaced, one part of the zip changed. Its first
data row is the prototype every row is cloned from and its last row is the
total, so a template whose table has fewer than three rows is refused rather
than guessed at. Clone through `stripIds()` — Word's `w14:paraId` must be
unique per paragraph in a document.

The figure that goes in the letter is what a sheet pays once its **accepted**
corrections are applied (`payableTotal`), which for an unruled finding is what
the trainer claimed. Anything that presents that number must say so; the
month-level "to rule on" count is findings with a fix, because a note with
nothing to apply is not a decision anyone owes.

The corrected workbook is written by editing the original file's XML in place
(`xlsxEdit.ts`), never by re-serialising it through SheetJS — the community
build cannot round-trip fills, merges or print settings, so a rebuilt workbook
would not be the trainer's template any more. Two things bite when editing that
XML: `<dimension>` has to be widened or readers silently ignore rows past the
old range, and a cell written where none existed has no style, so a date serial
shows as a number. Both are handled; keep them handled.

Findings carry ids derived from their code, date and cells rather than a
counter, because the verifier decides them one at a time while edits to the
distance table re-run every rule.

`npm run build:standalone` bundles the same components into static files that
run without Next.js. Two things keep that working and are easy to break: the
bundle is ASCII-only, so a new regex with a non-ASCII range must be built from
a string (see `names.ts`), and a file download must go through
`saveFile()` rather than its own anchor, because the artifact viewer's sandbox
makes anchors inert.

A drafted sheet is stored and verified exactly like an uploaded one — same
IndexedDB store, own trainer tab, own findings, in the letter — and carries
`drafted: true` only so the page can label it. Keep it that way: the month is
finished when every trainer in the record sheet has a sheet, and a draft the
verifier cannot check is not one.

Sheets are also drafted for trainers who sent none (`generate.ts`), on the
template another trainer submitted — which is wiped of its ticks, initials and
signature cells first, so nothing of the sheet it came from survives into
someone else's claim. Those are drafts of what the record sheet says is owed,
never a claim the trainer made, and nothing in the app or the file name should
suggest otherwise.

Two facts live outside the files and are entered by the office — how far each
site is from the centre, and the signed timecards for work that issues no
certificates. Both are kept in IndexedDB and reused every month. Never infer
either: a site without a distance is reported as unpriced, and a timecard that
contradicts the record sheet is reported as a conflict. Note also that the
record sheet's `RigNo` is the *trainee's* rig, not where the course ran, so it
never decides a rate band — `Location` does.

## Charts

Chart label collisions are checked by measuring intersecting text bounding boxes
in the rendered SVG rather than by eye, across several viewport widths.
