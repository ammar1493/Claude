# NEFT Training Analytics

A web port of the NEFT Shiny dashboard (`reference/app.R`), built with Next.js and
deployable to Vercel. Every tab, filter, KPI and chart of the R app is reproduced,
using the same aggregation rules so the numbers match.

**Brand:** NEFT navy `#002147` and gold `#FFC000`, Inter, and the NEFT logo/slogan
GIFs in `public/brand/`.

## Tabs

| Tab | What it shows |
| --- | --- |
| Executive Summary | Period KPIs vs the prior period, WellSharp at a glance, Special Projects (Qiddiya + Takamol), activity trend, top clients, monthly participants, instructor capacity |
| Year-over-Year | Participants and sessions by year (2023 from the manual table), plus monthly breakdown for the selected year |
| HSE | HSE course counts, top/next-10 clients, courses and instructors, and HSE trends |
| WellSharp | Course-hours reference, period teaching hours and sessions, top-6 instructors, course breakdown, retakes, top-5 clients, instructor detail |
| Qiddiya Academy | Figures parsed from QCTA trainer-utilization workbooks, merged with manual months |
| Takamol | Fully manual monthly figures, cumulative and yearly views |
| Quality Metrics | Instructor evaluation scores read from the published Google workbook |
| Data Table | The filtered raw rows |

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

**Training workbook** (`/api/dataset`), tried in order:

1. `NEFT_DATA_XLSX_URL` — a published `.xlsx` URL set as an environment variable
2. `public/data/dataset.xlsx` — a workbook committed to the repo
3. the published Google workbook the R app already used
4. an upload from the sidebar, stored in the browser and preferred over all of the above

**Qiddiya workbooks** (`/api/qiddiya`): every `.xlsx` in `public/qiddiya/` whose name
contains `QCTA` or `Qiddiya`, plus any workbook added from the Qiddiya tab.

**Quality Metrics** (`/api/sheet?name=…`): the published Google workbook, fetched
server-side so the request stays same-origin.

## Deploying to Vercel

```bash
npm install
npm run build      # verify locally first
```

Then either import the repository at [vercel.com/new](https://vercel.com/new) — the
framework is detected automatically, no build settings to change — or:

```bash
npx vercel deploy --prod
```

Set the optional environment variables from `.env.example` under
**Project → Settings → Environment Variables** if the workbook lives at a URL
rather than in the repo. `/api/dataset` and `/api/sheet` cache their fetches for
15 minutes, so a republished workbook appears within that window.

## Differences from the Shiny app, and why

| R app | Here |
| --- | --- |
| Manual entries written to `manual_entries/*.csv` next to the app | Stored in the browser, with **Import CSV** / **Export CSV** in the same column format — Vercel gives a deployed app no writable disk |
| Qiddiya workbooks discovered by scanning working directories at runtime | Read from `public/qiddiya/`, plus in-browser uploads — a serverless deployment has no such directory to scan |
| `downloadHandler` renders `report.Rmd` to PDF via LaTeX | **Generate PDF Report** opens the browser's print dialog against a print stylesheet that hides the chrome and keeps cards from splitting across pages |
| `shiny::showNotification()` | Toasts in the bottom-right corner |

## Local development

```bash
npm run dev        # http://localhost:3000
npm run typecheck
```
