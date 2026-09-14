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
incentive against what they actually taught. It takes three files, all read in
the browser:

| File | What it is |
| --- | --- |
| Record sheet | The month's certificate export — `CertNo`, `StudentName`, `ClientName`, `InstructorName`, `PrintedCourseName`, `IssuedOn`, `Location`, `SessionNo`, `RigNo`. Evidence that a session ran. |
| Courses Duration | `Course Name` / `Duration`, where duration is `Half Day`, `1 Full Day` or `N Days`. |
| Incentive sheets | The trainers' workbooks — a `.zip` of them, or the `.xlsx` files. Each has a claim grid (rate lines down, days of the month across) and a verification log (one line per session). |

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
- **The distance bands have no half-day line**, so a half-day course at a rig
  still books the whole day there. Those days are reported as notes, never as
  over-claims; what *is* an error is a distance rate on a day the record sheet
  puts at the NEFT centre.
- **Short-hand course names are not guessed at.** "first aid" matches five
  courses in the list, one of them a full day, so the line is reported as
  ambiguous rather than valued.
- Names are matched on their consonant skeleton (`src/lib/incentives/names.ts`),
  which is what joins "Ahmed Ibrahim Aboubakr" to the record sheet's
  "Ahmed Abubakr" and "ASIF FARID" to "Asif Farid Israr Ulhaq".

Findings are graded **Must change** (a claim that is wrong), **Check** (needs a
human — a distance to confirm, a duration that reads short) and **Note**
(under-claims, unmatched course names). Only priced Must-change findings move
the verified total; the card says how many are still open.

**Getting it out.** The claim grid on screen is the report — a coloured tick is
a finding, and selecting it opens the wording to send back to the trainer.
**Findings workbook** downloads Summary / Findings / Day-by-day sheets (values
only: the community build of SheetJS cannot write cell fills, so the
highlighting stays in the app and on **Print**).

The three workbooks are kept in IndexedDB, so the record sheet and course list
survive a reload and only the trainers' sheets change month to month. Nothing
is sent to a server.

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
