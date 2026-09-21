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

`/bookings` and `/incentives` are separate routes rather than tabs — see
[Booking and scheduling](#booking-and-scheduling) and
[Incentive verification](#incentive-verification).

## Incentive verification

`/incentives` checks the time sheets trainers submit for their monthly
incentive against what they actually taught. The form it checks is **NE-HR050
Training Operations Incentive Form 2026**, which ships with the app — nothing
has to be uploaded to draft a sheet or write the month's letter. It reads up
to four files, all in the browser:

| File | What it is |
| --- | --- |
| Record sheet | The month's certificate export — `CertNo`, `StudentName`, `ClientName`, `InstructorName`, `PrintedCourseName`, `IssuedOn`, `Location`, `SessionNo`, `RigNo`. Evidence that a session ran. |
| Courses Duration | `Course Name` / `Duration`, where duration is `Half Day`, `1 Full Day` or `N Days`. |
| Incentive sheets | The trainers' workbooks — a `.zip` of them, or the `.xlsx` files. Each has a claim grid (rate lines down, days of the month across) and a verification log (one line per session). |
| Incentives letter | Optional. The *Monthly Incentives — Instructors* letter is built in and its month is filled from the record sheet; upload one only to write on a different template. |

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
- **A weekend day with no course is standby, not an invention.** A trainer
  called in for a Friday or Saturday course that then does not run has given
  up the day, and the scheme pays half the weekend rate for it. It is the one
  case where a claim with nothing behind it is correct, so it is settled
  before the rules that would read the empty day as unsupported — and a full
  day claimed for it comes back as an over-claim. Only Friday and Saturday,
  and only at the centre: the distance bands carry their own
  Traveling/Standby line, which is what a trainer who drove 400 km is owed.
- **Two half-day classes on a weekday are a morning and an afternoon.** The
  form has a line for each, and 50 plus 50 is the same 100 as the full-day
  line, so nobody is paid differently — but a sheet that says "full day"
  cannot be read against a log that says two classes.
- **A multi-day course is one line per day, each a full day.** "4 Days" in the
  Duration cell describes the course, not the day the line is dated; the grid
  has a tick on each of the four. NE-HR050's Duration column is a dropdown
  offering Half Day, Full Day and Outbound, so there is no cell to write
  "4 Days" into any more.
- **Travelling and teaching cannot both be claimed for one day.** The form's
  own standards say so in as many words, and the record sheet decides which
  one stands.
- **Short-hand course names are not guessed at.** Where the courses a written
  name matches disagree on how long they run, the line is reported as
  ambiguous rather than valued. **First aid is the exception**, because the
  office settled it by rule: five entries mention first aid and only the Saudi
  Heart Association course is a full day, so a line naming SHA is that course
  and a line that does not is one of the half days. In August that turns
  *"first aid — fullday"* from a shrug into an over-claim with the cell to
  correct. The rule narrows rather than decides: add a second full-day
  first-aid course that is not SHA and the line goes back to being reported.
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

### Freelancers

The rates printed on the form — 50 for a morning, 100 for a day at the
centre, 250 for a rig — are staff rates. A freelancer's teaching allowance is
a flat rate a day and half of it for a half day, wherever the course ran, so
**Terms** on the summary is one click per trainer and their whole month is
re-priced from the days that survived verification rather than from the lines
they were ticked on. It is remembered per person, like their site distances.

The allowance is **$75 a day and $37.50 a half day**, and it is in dollars
while the sheets, the record sheet and the letter are all in riyals. A total
mixing the two would mean nothing, so it is converted before it is added to
anything: **3.75 riyals to the dollar**, the peg, which makes $75 a day 281.25
SAR. All three figures are editable above the table, the rate included, for a
month the office settles at something else.

Because it replaces the rate table rather than correcting it, a freelancer's
figure is not the total their corrected workbook computes: that workbook is
their own form, and the form pays staff rates. The letter and the report take
the allowance; the workbook stays the trainer's sheet with the ticks put right.

### Colouring the days

The form prints two swatches beside the words Friday and Saturday and the
instruction *"Highlight in above listed colors for days"*. Trainers were doing
it by hand, which is why so few sheets had it done consistently, so the
corrected and drafted workbooks now do it: **Friday yellow (FFFF00)** and
**Saturday light green (A9D18E)** in both tabs, taken out of the template's own
legend rather than picked to match, and **light blue (DEEBF7)** on the claim
grid for the other days that were taught. The day numbers along the top of the
grid are coloured too, so an empty yellow column is a Friday nobody worked
rather than a Friday nobody noticed.

Writing a fill is not the same as writing a value: the cell carries an index
into `cellXfs`, and that record points at a fill, a font, a border and a
number format at once. `StyleTable` in `xlsxEdit.ts` finds the record that is
the cell's own formatting plus the colour, appends it if it does not exist,
and leaves every other record alone — so the rest of the workbook keeps
pointing at exactly the style it pointed at before.

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

## Booking and scheduling

`/bookings` is the booking sheet, digitalised. The office keeps every booking
in one Excel workbook — one row per participant, 17,000 rows and growing — and
that sheet cannot say who is teaching, whether the customer has actually
confirmed, or whether the purchase order is in. So the daily plan is made by
eye and a clash is found on the morning it happens.

The workbook is uploaded **once**. After that the register lives in the app:
new bookings are typed in, statuses are set, the schedule is built, and the
Excel file becomes an export rather than the system of record.

### What one booking is

A **booking** is one company's group on one delivery: one course, one set of
dates, one start time, one venue. The participant rows in the sheet are grouped
into it. A **class** is what actually runs — the same course, dates, hour and
venue, whoever is paying. Two companies sitting in the same classroom are two
bookings and one class.

The distinction does real work. Each company has its own purchase order and its
own confirmation, so those are per booking. One instructor teaches the room, so
the assignment and every clash check are per class — an instructor covering
both companies is not double-booked, and the schedule would say they were if
the two were not kept apart. The 17,813 participant rows in the September 2026
sheet come out as 4,182 bookings across 3,338 classes.

### The columns the sheet could not carry

| Column | Values | Where it comes from on import |
| --- | --- | --- |
| Booking ref | `NB-0001`… | Assigned in date order |
| Booking status | Not confirmed · Confirmed · Delivered · Cancelled | `Booking Status`; `CANCELLED` in either location column wins; anything already finished is set to Delivered |
| PO status | Not required · PO not received · PO under process · PO received | Read from `PO#`: blank or `N / A` is not received, `UNDER PROCESS` is under process, anything else is a reference on file. NEFT's own work needs none |
| Instructor | the roster | Nothing in the sheet — assigned here |
| Delivery | Classroom · Online · Client site | The first `LOCATION` column |
| Language | English · Arabic · Urdu · Not stated | The same column — it is what decides who can teach it |
| Venue | `NEFT`, `NEFT-OUTBOUND`, or the site | The last `Location` column, with the office's three spellings of OUTBOUND folded together |
| Trainees | count | The participant rows grouped into the booking |

`Remarks` is dropped where it says `N / A`, which is 99% of the sheet, and kept
as a note where it says anything else.

Two of the office's own habits are honoured rather than corrected. Repeated
participant names are kept and counted — a seat booked twice is a seat billed
twice until someone says otherwise, the same rule the dashboard applies to the
`Duplicates` column. And the record sheet's `RigNo` is the trainee's rig, never
where the course ran, so it never decides anything.

### Reading a sheet people fill in by hand

Columns are found by their heading, not their position — the sheet has two
columns both called some form of "Location", and the office adds one whenever
it needs to. Values are matched on wording: dates arrive as `31/Dec/25` and as
Excel serials, times as `8:30 AM`, `04:00PM`, and `09:3O AM` with a letter O
where the zero should be. A half-typed meridiem is read from its first letter,
and a class that would finish before it starts has the twelve hours added back,
because `12:30 AP` against a 1:30 PM start is an afternoon nobody finished
typing.

The date range is the truth about how long a course runs — `Course Duration`
disagrees with it on 2% of rows and is the one that is wrong. But a range that
runs backwards, or one a mistyped year stretches to 2029, is not a range: there
the stated duration counts the days out from the start, and the row is reported
on the import screen so someone fixes the sheet. Thirteen rows in the September
2026 file need that.

### Course lengths

Six courses have a length that is a fact of the course rather than of the
booking, because IADC accredits them at it:

| Course | Days |
| --- | --- |
| WellSharp Well Servicing OGO | 5 |
| WellSharp Drilling Supervisory Level | 5 |
| WellSharp Drilling Driller Level | 5 |
| WellSharp Well Servicing Coiled Tubing | 3 |
| WellSharp Well Servicing Wireline | 3 |
| WellSharp Well Servicing Workover | 3 |

A retake sits outside the table: it is the exam alone, one day, which is how
the booking sheet already writes it.

They are the office's figures (`src/lib/bookings/courses.ts`), and the booking
sheet's own `Course Duration` column agrees with all six wherever it is filled
in. They do three things: pick the length when a booking's date range is
unusable, so a broken row is rebuilt from the accreditation rather than from a
hand-typed cell; fill in the last day when one of the six is chosen in the
new-booking form; and flag a class booked over the wrong number of days in the
plan check. That last one is a warning, not an error — the office books
exam-only sittings and the occasional extended class on purpose. Seven of the
164 WellSharp classes in the September 2026 sheet disagree with the table.

Names are matched whole, not by keyword, because the catalogue is full of near
misses that are different courses: `SLICK LINE/WIRELINE APPLICATIONS` (NEFT
T13) is not the WellSharp wireline course, `ADVANCED WORKOVER OPERATIONS
WORKSHOP` (NEFT T07) is not the workover one, and `SCAFFOLDING SUPERVISOR` is
not a supervisory level. The office's own drift is repaired first, so
`LEEVEL`, `SUPERVIOSRY` and a stuck-pipe course bolted onto a supervisory
booking all resolve rather than becoming phantom courses.

> **This table disagrees with the dashboard.** `WELLSHARP_HOURS` in
> `src/lib/config.ts`, ported from the Shiny app, gives every one of the six a
> day less — 4/4/4/2/2/2 against 5/5/5/3/3/3 — and at six hours a day that is
> the difference between 24 teaching hours and 30. It feeds the WellSharp tab's
> hours figures and has deliberately not been touched here, because changing it
> moves numbers that have already been reported.

### The daily schedule

The schedule shows a day at a time, with the week above it marking which days
still have a class nobody is teaching. A class carries its hours, venue,
language, companies, trainee count and booking references, and one select
assigns the instructor to the whole class. Every name in that select says why
it would be a bad pick — *on leave*, *already teaching*, *not approved* —
rather than leaving you to find out.

**Fill the month** assigns the empty classes. The hardest class goes first, the
one with the fewest people who could teach it, because a class with a single
candidate loses that candidate if an easier class takes them first. Among the
candidates, the one carrying the fewest days that month takes it, so the work
spreads instead of piling onto whoever sorts first. Nothing already assigned is
moved, and a class nothing can take is left open with the reason — a gap you
can see is worth more than an assignment that is wrong.

### Instructors, approvals and leave

Neither fact the schedule needs is in the booking sheet: who can teach what,
and who is away. Both are entered once and reused every month, the same way the
verifier keeps its site distances.

A new instructor is approved for **every** course and language until you narrow
it, so a schedule can be built on day one and tightened later. An empty course
list means any course; an empty language list means any language. A class whose
language the sheet never stated is not held against anyone.

Leave is entered against the plan rather than beside it. The month grid shows
every instructor day by day — teaching, on leave, weekend — and booking a
holiday over a class that person is already teaching says so as you save it.
Friday and Saturday are marked as the weekend.

### Plan check

One list of everything that would go wrong if the month ran as written, split
by what it asks of you:

- **Has to be fixed** — a class with nobody on it, a class split between two
  instructors, one person in two rooms at the same hour, someone teaching
  through their own leave.
- **Worth checking** — an instructor not approved for the course or the
  language, a confirmed course with no purchase order behind it, a class
  starting within a fortnight that the customer has still not confirmed.

The rules are asserted against worked examples in `scripts/check-schedule.mjs`
(`npm run check:schedule`) rather than only described here — change a rule and
you change a case and say why.

### Export

**Export the month** writes a workbook for the planning month: `Bookings` (one
row per participant, the sheet's own columns plus the new ones), `Schedule` (one
row per class per day, which is the form the training floor reads),
`Instructors`, `Leave` and `Conflicts`. Small enough to mail round. The backup —
every booking the register holds, history included — is **Export every booking**
on the import tab; two years of the sheet is 17,000 participant rows and a
workbook to match, which is not what you want when you asked for September.

Both are new workbooks, built rather than edited, so none of the care the
incentive verifier takes over round-tripping a trainer's template applies.

A second import **merges**: it adds bookings the register has never seen and
touches nothing already decided here. Clearing the register is a separate,
confirmed action, and it leaves the roster and the leave alone.

Everything lives in the browser's IndexedDB — Vercel gives the app no writable
disk, so the register is kept where the uploaded workbooks already are.

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

**Booking workbook.** Uploaded once at `/bookings` and kept in IndexedDB from
then on — see [Booking and scheduling](#booking-and-scheduling). It is the only
workbook the app treats as a starting point rather than as the record.

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
npm run dev             # http://localhost:3000
npm run typecheck
npm run check:schedule  # the booking scheduler's rules, against worked examples
```
