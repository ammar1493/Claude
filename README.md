# NEFT Training Analytics

A web port of the NEFT Shiny dashboard (`reference/app.R`), built with Next.js and
deployable to Vercel. Every tab, filter, KPI and chart of the R app is reproduced,
using the same aggregation rules so the numbers match.

**Brand:** built to `reference/Neft-Brand-Guidelines.pdf` — see [Brand system](#brand-system).

## Tabs

| Tab | What it shows |
| --- | --- |
| Executive Summary | Period KPIs vs the prior period, WellSharp at a glance, Special Projects (Qiddiya + Takamol), activity trend, top clients, monthly participants, instructor capacity |
| Year-over-Year | Participants and sessions by year (2023 from the manual table), plus monthly breakdown for the selected year |
| HSE | HSE course counts, top/next-10 clients, courses and instructors, and HSE trends |
| WellSharp | Course-hours reference, period teaching hours and sessions, top-6 instructors, course breakdown, retakes, top-5 clients, instructor detail |
| Qiddiya Academy | Figures parsed from QCTA trainer-utilization workbooks, merged with manual months |
| Takamol | Fully manual monthly figures, cumulative and yearly views |
| Quality Metrics | A scorecard over all thirteen evaluation questions: overall score, weakest questions, an instructor-by-question grid, who needs attention, and the raw counts per question |
| Data Table | The filtered raw rows |

`/incentives` is a separate route rather than a tab — see
[Incentive verification](#incentive-verification).

## Incentive verification

`/incentives` checks the time sheets trainers submit for their monthly
incentive against what they actually taught. It takes four files, all read in
the browser:

| File | What it is |
| --- | --- |
| Record sheet | The month's certificate export — `CertNo`, `StudentName`, `ClientName`, `InstructorName`, `PrintedCourseName`, `IssuedOn`, `Location`, `SessionNo`, `RigNo`. Evidence that a session ran. |
| Courses Duration | `Course Name` / `Duration`, where duration is `Half Day`, `1 Full Day` or `N Days`. |
| Incentive sheets | The trainers' workbooks — a `.zip` of them, or the `.xlsx` files. Each has a claim grid (rate lines down, days of the month across) and a verification log (one line per session). |
| Incentives letter | Last month's *Monthly Incentives — Instructors* letter, in Word. Optional, and only needed at the end: it is the template the month's letter is written on. |

Two reference tables fill the gaps the first three leave, and both are kept
between visits so they only get built once:

| Table | What it settles |
| --- | --- |
| **Sites & distances** | Every place name the month mentions. Anything that is not the NEFT centre is an outbound course, and the scheme pays outbound by distance — so the office types the kilometres in once per site, or marks it a rig or well, which takes the top band whatever the distance. |
| **Timecards** | Rig competency assessment issues no certificates, so the record sheet has nothing for it. The client-signed timecard is the evidence instead: assessor, unit, dates, days, with the scan attached. |

A card usually carries two rows — the days on the unit, and the days added
afterwards for writing the report in the office — so each block says what it
**counts as**. Both are worked and payable, but only the first is a day on the
unit, so *"the timecard confirms eight days"* means eight, not ten, and the
report-writing days are reported separately. Claiming one of them at the
distance rate is an error the two-row card exists to catch.

### Sheets that never arrived

A claim nobody made is the one error a verifier cannot see: no sheet arrives,
nothing is checked, and the trainer is not paid. **Not received** lists every
trainer with sessions in the record sheet and no sheet uploaded — matched on the
name, so "ASIF FARID" is not chased for a sheet already sent as "Asif Farid
Israr Ulhaq" — with their days, sessions, participants and what the month comes
to at the template's rates. Names that are not people (`Freelancer`, partner
companies) can be left off the list and stay off in every month after.

**Draft** writes each one on the template another trainer submitted: wiped of
its ticks, its initials column and its signature cells, then filled from the
record sheet and any timecards, with the verification log written from the same
evidence. **Draft all** returns them as one `.zip`. In August that is 12 sheets
covering 77 days and 8,400 SAR that nobody had claimed.

A draft is a draft — what the record sheet says is owed, not what the trainer
claims, and the two differ over a travelling day, a per diem, a class the
certificates do not show. The file name says `drafted`; send it to be checked
and signed, never straight to payroll.

**A draft then joins the month as a sheet.** It is stored beside the uploads,
gets its own trainer tab, and is verified, corrected and paid exactly like one
that arrived by email — the summary row marks it `drafted` and nothing else
about it is different. That is the point: a month is only checked once every
trainer in the record sheet has a sheet in it. Deleting a draft puts its
trainer straight back on **Not received**.

Each claimed day is priced against the sessions that instructor delivered that
day, and the report names the cell, says why it has to change, and what it
should say instead. The rules live in `src/lib/incentives/verify.ts`; the
interesting ones are:

- **A day is worth what its courses are worth.** A full-day claim on a date
  whose only session is a half-day course comes back as an over-claim, priced
  at the trainer's own rate table — the case the module exists for.
- **Sessions are grouped into classes before they are counted.** One morning
  class issues several session numbers (an Awareness group and a Level-2 group,
  split again per client), so counting session numbers would turn one half day
  into three. A new class starts when the course subject changes or when the
  session numbering jumps; `groupSessionsIntoBlocks()` carries the reasoning.
- **Multi-day courses issue their certificates on day one**, so a `4 Days`
  course starting on the 16th makes the 17th, 18th and 19th teaching days too.
- **The band is arithmetic once a site has a distance**, so a rate-band
  correction is priced from the sheet's own table: a day at a site 18 km away
  claimed at the over-350 km rate comes back with the right line and the
  difference in riyals. A site with no distance yet is reported as exactly that
  rather than guessed at, and the summary says how many are outstanding.
- **The distance bands have no half-day line**, so a half-day course at a rig
  still books the whole day there. Those days are a note, not an over-claim —
  unless the band itself is wrong, in which case the band correction carries
  the day and the note stays quiet, so the same riyals are never subtracted
  twice.
- **A signed timecard buys the whole day.** Its days stop reading as
  unsupported, at the band its unit sits in. When the record sheet *also* shows
  teaching on a day a card covers, that is reported as a conflict and left
  unpriced — the trainer cannot be on a rig and in the classroom, and which
  record is wrong is not something the files can settle.
- **Short-hand course names are not guessed at.** "first aid" matches five
  courses in the list, one of them a full day, so the line is reported as
  ambiguous rather than valued.
- Names are matched on their consonant skeleton (`src/lib/incentives/names.ts`),
  which is what joins "Ahmed Ibrahim Aboubakr" to the record sheet's
  "Ahmed Abubakr" and "ASIF FARID" to "Asif Farid Israr Ulhaq".

Findings are graded **Must change** (a claim that is wrong), **Check** (needs a
human — a distance to confirm, a duration that reads short) and **Note**
(under-claims, unmatched course names). Only priced Must-change findings move
the verified total; the card says how many are still open. A finding with no
fix to apply is a note to read, not a decision owed, so the month-level
**To rule on** count leaves it out — a count that cannot be cleared by reading
is a count that gets cleared without reading.

### Deciding, then correcting

Each finding carries **Apply the fix** / **Keep as claimed**, and says exactly
which cells its fix would change — *Clear C12; Tick C10 — Half day
(08:00–12:00)*. Nothing is applied that was not accepted. A finding with no
mechanical fix — a timecard that contradicts the record sheet, a session number
nobody can guess — can only be acknowledged, and those stay on the report for
whoever signs it. A site that still has no distance can be given one from
inside the finding that asked for it.

The claim grid doubles as the preview: an accepted correction strikes through
the tick it clears and marks the one it adds, so the grid reads as the
corrected sheet before anything is generated.

**Generate the corrected sheet** then writes that file. It is the trainer's own
workbook — same template, same rates, same signature blocks — with only the
accepted cells rewritten and the totals recalculated. That is not a figure of
speech: `xlsxEdit.ts` edits the `<c>` elements inside the sheet XML and copies
every other part of the zip through byte for byte, because reading the workbook
into a spreadsheet library and writing it back would lose every fill, merge and
print setting the community build cannot round-trip. Of the 26 parts in a
typical sheet, three change: the two tabs and `workbook.xml`, which gains
`fullCalcOnLoad` so Excel recalculates on open.

Optionally the **verification log is rewritten from the record sheet** — one
line per session actually delivered, with its real session number and the
duration the course list gives it, plus any timecard days and the continuation
days of multi-day courses. Off by default: it replaces what the trainer wrote.

Feeding a generated sheet back through the verifier is the test that matters,
and it is how the rules above were checked: ten of August's eleven come back
with no errors at all, and so do all twelve of the drafted ones. The eleventh is Ahmed Abubakr, whose timecard and record
sheet contradict each other — which is the one thing the tool will not decide.

### The month's letter

Once every sheet has been ruled on, **Monthly Incentives (.docx)** writes the
letter finance signs: one numbered row per trainer, the figure their corrected
sheet pays, and the total. It is written the same way the corrected workbooks
are — the office's own document with its table rows replaced, so the
letterhead, the three signature blocks, the table's fills and the page setup
come through untouched. Of the 15 parts in the template, one changes:
`word/document.xml`.

The figure in each row is what the sheet **will pay**, not what it claimed and
not what the rules alone verified: a correction only counts once somebody has
accepted it. So the summary carries a **To rule on** count per sheet, and the
letter's banner says how many corrections are still unruled and that those
sheets go in at what the trainer claimed. A row that pays more than the record
sheet backs is shown in gold rather than teal for the same reason. Drafted
sheets are in the letter like any other — a trainer who sent nothing is still
owed their month.

**Getting it out.** The claim grid on screen is the report — a coloured tick is
a finding, and selecting it opens the wording to send back to the trainer.
**Findings workbook** downloads Summary / Findings / Day-by-day / Sites /
Timecards sheets (values only: the community build of SheetJS cannot write cell
fills, so the highlighting stays in the app and on **Print**). The two
reference tables travel with the report because a verified figure is only as
good as the distance it was priced at.

The three workbooks, both reference tables and the timecard scans are kept in
IndexedDB, so the record sheet, the course list and the distances survive a
reload and only the trainers' sheets change month to month. Nothing is sent to
a server.

**Timecards are typed in, not read.** The cards come back as signed scans with
no text layer — a photograph of a table — so the six fields are entered by hand
and the scan is attached beside them. Reading dates off a photograph is not the
kind of evidence a payment should rest on; if your cards arrive with a text
layer, parsing them to pre-fill the form is the obvious next step.

## Brand system

Tokens live in `src/lib/brand.ts` and `src/app/globals.css`, taken from sections
03–05 of the guidelines.

| Role | Value |
| --- | --- |
| Navy — primary surfaces and headline text | `#001A45` |
| Gold — primary accent | `#F5A623` |
| Teal — secondary | `#0E6472` |
| Green — tertiary | `#8DC63F` |
| Fog — background | `#F6F7F9` |
| Slate — supporting text | `#5B6472` |
| Typeface | Tajawal — headings 700–900, body & UI 400–500 |

Three rules shaped the layout, so they are worth stating:

- **Gold is never a large flat fill.** It carries key figures, section markers,
  CTAs and the leading bar of a ranking — never a card header or a whole series.
- **Teal and green appear only in data visualization.** Sections are identified
  by their chart series colour and a gold marker rule, not by a coloured header
  bar, so the HSE tab reads teal in its charts rather than green in its headers.
- **Icons are single-weight 2px line icons in navy or white**, no fills and no
  gradients (`src/components/Icons.tsx`).

The mark supplied in this repo is the icon mark, not the full lockup, so the
120px full-lockup minimum does not apply to it — section 02 in fact directs you
to the icon mark alone at small sizes. It is used full-colour on white only,
never on the navy sidebar, and `public/brand/neft-logo.png` is the animation's
final frame so the header does not flicker mid-build.

## How the R logic was ported

The rules that drive the numbers live in `src/lib/` and each file names the R
function it came from:

- `selectors.ts` — `period_stats()`, `chart_df()`, `strategic_df()`, `valid_filtered_df()`
- `wellsharp.ts` — `normalize_wellsharp_course()`, `wellsharp_data()`, `ws_session_hours()` and the teaching-hours rollups
- `hse.ts` — `is_hse_course()`. As in the R original, every course that is **not** an IADC WellSharp course counts as HSE; `HSE_KEYWORDS` is declared but never consulted, and that behaviour is preserved deliberately
- `qiddiya.ts` — `parse_qiddiya_sheet()` / `load_qiddiya_all()`, including the merged multi-day session rule and the Standby/Total cutoff
- `dates.ts` — the `lubridate` calls, including `floor_date(..., week_start = 5)` for the WellSharp weekly charts
- `config.ts` — the manual 2023 table, WellSharp course hours, evaluation questions

## Data sources

**Training workbook.** The intended workflow is to upload the export on each
visit: the dashboard opens on a drop zone, and the workbook is parsed in the
browser and kept in IndexedDB, so a reload does not need a re-upload. Replace it
from the sidebar at any time. Nothing is sent to a server.

An upload always wins. With no upload stored, `/api/dataset` is tried in order:

1. `NEFT_DATA_XLSX_URL` — a published `.xlsx` URL set as an environment variable
2. `public/data/dataset.xlsx` — a workbook committed to the repo
3. the published Google workbook the R app already used

The first sheet carrying all six required columns is used; extra columns
(`Location`, `Session No`, `Duplicates`, …) are carried through to the Data Table
untouched. **2023 has no workbook records, so those monthly figures stay hard-coded**
in `MANUAL_2023` (`src/lib/config.ts`) and feed the Year-over-Year tab — the
uploaded workbook only needs 2024 onwards.

**Qiddiya workbooks.** Add the QCTA file from the Qiddiya Academy tab, or commit
it to `public/qiddiya/` (any `.xlsx` whose name contains `QCTA` or `Qiddiya` is
picked up by `/api/qiddiya`). **Every sheet in the workbook is parsed**, so a
single file with one tab per month works — the Period selector then lists each
month, and totals across tabs are summed with duplicate (date, class, course)
rows counted once.

Verified against `QCTA — Trainers Utilization — July 2026`: the parser returns
504 participants and 52 teaching days, matching the workbook's own totals. It
reports 46 sessions where the workbook's summary cell says 45 — the workbook's
per-block course counts also sum to 46, so its Sessions formula appears to miss
the unlabelled block at the bottom (Waqas Anjum · Confined Space Rescue · 27 Jul),
whose 14 students its Students total does include. The parser counts every
course cell, which is what app.R did.

**Quality Metrics** (`/api/quality`): the published Google workbook, fetched and
parsed server-side in one pass. It expects one tab per question, the instructor
in the first column and the counts of 1–5 star responses in the next five —
the layout app.R read. Point `NEFT_QUALITY_XLSX_URL` at a different workbook to
override it. Missing tabs are reported on the tab rather than failing the page.

### Hosting only the verifier

`npm run build:standalone` bundles `/incentives` into a folder of plain static
files — `index.html`, `app.js`, `styles.css` and the mark — that runs anywhere a
static file can be served, with no Next.js server behind it. Everything the page
does still happens in the browser, so the workbooks never leave it.

Two details make the bundle portable rather than merely built:

- **Downloads go through whichever route the host allows.** On its own origin
  that is an anchor with a `download` attribute; inside the claude.ai artifact
  viewer the page is sandboxed and an anchor is inert, so
  `src/lib/incentives/download.ts` asks the platform's `downloads` capability
  first and falls back. Publish it there with `capabilities: {downloads: true}`
  or the corrected sheet cannot reach the viewer.
- **The JavaScript is ASCII-only** (`charset: "ascii"`). A host that serves
  `.js` without a charset makes the browser read it as latin-1, and the
  combining-mark range in the name matcher then becomes an invalid regular
  expression that throws before anything mounts. Regexes a bundler prints
  verbatim are built from strings in `names.ts` and `timesheet.ts` for the same
  reason — those two files are the ones to watch if a new one is added.

Assets resolve through `ASSET_BASE` in `src/lib/brand.ts`: `/` in the Next app,
empty in the standalone build, which also hides the link back to a dashboard
that is not hosted alongside it.

## Deploying to Vercel

`main` is the production branch and carries the app. Vercel builds it on every
push, so shipping a change is a push to `main` — there is no manual deploy step.

Work is committed on `claude/r-app-dashboard-vercel-nclum7` and `main` is then
fast-forwarded to it:

```bash
git push -u origin claude/r-app-dashboard-vercel-nclum7
git push origin origin/claude/r-app-dashboard-vercel-nclum7:main
```

The two refs stay identical, so the fast-forward never produces a merge commit.
Check it is one before pushing:

```bash
git merge-base --is-ancestor origin/main origin/claude/r-app-dashboard-vercel-nclum7
```

### First-time project setup

1. Go to [vercel.com/new](https://vercel.com/new) and import `ammar1493/Claude`.
2. Leave every build setting alone — the Next.js preset is detected, and the
   defaults (`npm run build`, output `.next`) are correct. Node 20.9+ is
   required and pinned in `package.json`.
3. Deploy. Production Branch stays `main`.

Environment variables are optional — see `.env.example`. Set them under
**Settings → Environment Variables** only if the workbook should come from a URL
instead of being uploaded in the browser.

The footer of every page shows the deploy's short commit hash, so a page can be
matched to a commit when a number looks wrong.

### Verifying the deployment

- The dashboard should open on the **Load the training workbook** drop zone.
- Drop `NEFT_Data.xlsx` in; the Executive Summary should fill in (about 4-5
  seconds for a 70k-row export).
- The Qiddiya Academy tab should accept the QCTA workbook via **Add file**.
- Quality Metrics reads the published Google workbook server-side; if that tab
  shows a fetch error, the workbook's share settings are the thing to check.

All three API routes are dynamic, so nothing is frozen into the build; responses
are CDN-cached for 15 minutes.

## Differences from the Shiny app, and why

| R app | Here |
| --- | --- |
| Manual entries written to `manual_entries/*.csv` next to the app | Stored in the browser, with **Import CSV** / **Export CSV** in the same column format — Vercel gives a deployed app no writable disk |
| `FILE_PATH <- "2024 Data.xlsx"` read from disk at startup | Uploaded in the browser each visit (or resolved from a URL / committed file), parsed client-side |
| Qiddiya workbooks discovered by scanning working directories at runtime | Read from `public/qiddiya/`, plus in-browser uploads — a serverless deployment has no such directory to scan |
| `downloadHandler` renders `report.Rmd` to PDF via LaTeX | **Generate PDF Report** opens the browser's print dialog against a print stylesheet that hides the chrome and keeps cards from splitting across pages |
| `shiny::showNotification()` | Toasts in the bottom-right corner |

## Local development

```bash
npm run dev        # http://localhost:3000
npm run typecheck
```
