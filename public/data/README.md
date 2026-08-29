# Training workbook

Drop the training workbook here as `dataset.xlsx` (the file app.R read as
`2024 Data.xlsx`) and it is served automatically by `/api/dataset`.

The first sheet whose header row carries all of these columns is used:

- `Actual Date`
- `Course Name`
- `Client`
- `Instructor Name`
- `Participant's Name`
- `Actual Sessions`

One row = one participant seat, exactly as the R app assumed.

Prefer not to commit the data? Two alternatives, in the order the API tries them:

1. Set `NEFT_DATA_XLSX_URL` in the Vercel project to a published workbook URL.
2. Upload the workbook from the dashboard sidebar — it is stored in the
   browser (IndexedDB) and survives reloads on that machine.
