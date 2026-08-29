###############################################
# NEFT Professional Dashboard - Enhanced with HSE & WellSharp Summaries
###############################################

library(shiny)
library(bslib)
library(bsicons)
library(readxl)
library(dplyr)
library(lubridate)
library(plotly)
library(DT)
library(stringr)
library(rmarkdown)
library(tibble)

# Fallback for shiny's %||% (older shiny versions may not export it)
if (!exists("%||%")) {
  `%||%` <- function(a, b) if (!is.null(a)) a else b
}

# ---------------------- BRAND CONFIG ---------------------- #
NEFT_NAVY     <- "#002147"
NEFT_GOLD     <- "#FFC000"
HSE_COLOR     <- "#2E7D32"      # green for HSE elements

neft_theme <- bs_theme(
  version = 5,
  bg = "#F8F9FA", 
  fg = "#002147",
  primary = NEFT_NAVY,
  secondary = NEFT_GOLD,
  base_font = font_google("Inter"),
  heading_font = font_google("Inter"),
  font_scale = 0.95
)

# ---------------------- DATA & GLOBALS ---------------------- #
FILE_PATH <- "2024 Data.xlsx"
required_columns <- c("Actual Date", "Course Name", "Client", 
                      "Instructor Name", "Participant's Name", "Actual Sessions")
GOOGLE_XLSX_URL <- "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ6oTyvG8VEl4GJ4N6eVAN8CMNep_o9TltK6j6UxSlOryk4WMzqXomVippcX2jrySnmkuHnH7pVe5QV/pub?output=xlsx"

# Manual 2023 Data
manual_2023 <- tribble(
  ~Year, ~MonthNum, ~Participants,
  2023, 1, 1561, 2023, 2, 1508, 2023, 3, 1934, 2023, 4, 862,
  2023, 5, 1910, 2023, 6, 1737, 2023, 7, 2144, 2023, 8, 2498,
  2023, 9, 2627, 2023, 10, 3364, 2023, 11, 2260, 2023, 12, 2314
) %>% mutate(Month = as.Date(paste(Year, MonthNum, "01", sep = "-")))

total_2023_participants <- sum(manual_2023$Participants)

questions_map <- c(
  "Q1 = Was the instructor well prepared?" = "Well prepared",
  "Q2 = Did the instructor demonstrate good knowledge?" = "Demonstrated Knowledge",
  "Q3 = Was the instructor professional?" = "Professionalism",
  "Q4 = Did the instructor use effective teaching techniques?" = "Teaching Techniques",
  "Q5 = Would you recommend this instructor to others?" = "Recommend Instructor",
  "Q6 = Did the instructor encourage learning?" = "Encourages Learning",
  "Q7 = Was the content expressed clearly?" = "Clarity",
  "Q8 = Was the instructor enthusiastic?" = "Enthusiasm",
  "Q9 = Did the instructor respond to questions clearly and helpfully?" = "Tutor Response",
  "Q10 = Were you happy with the course?" = "Happy on the whole",
  "Q11 = Were the materials sufficient?" = "Materials",
  "Q12 = Did you have enough time?" = "Enough Time",
  "Q13 = Would you recommend NEFT to others?" = "Recommend NEFT"
)

# WellSharp Course Hours Mapping (STANDARD NAMES)
wellsharp_hours <- tribble(
  ~CourseName, ~Days, ~HoursPerDay, ~TotalHours,
  "IADC - WELLSHARP DRILLING DRILLER LEVEL",       4, 6, 24,
  "IADC - WELLSHARP DRILLING SUPERVISORY LEVEL",   4, 6, 24,
  "IADC - WELLSHARP WELL SERVICING OGO",           4, 6, 24,
  "IADC - WELLSHARP WELL SERVICING COILED TUBING", 2, 6, 12,
  "IADC - WELLSHARP WELL SERVICING WIRELINE",      2, 6, 12,
  "IADC - WELLSHARP WELL SERVICING WORKOVER",      2, 6, 12,
  "IADC - WELLSHARP WELL SERVICING SNUBBING",      2, 6, 12,
  
  # Retake Exam variants (typically 1 day)
  "IADC - WELLSHARP DRILLING DRILLER LEVEL (RETAKE EXAM)",       1, 6, 6,
  "IADC - WELLSHARP DRILLING SUPERVISORY LEVEL (RETAKE EXAM)",   1, 6, 6,
  "IADC - WELLSHARP WELL SERVICING OGO (RETAKE EXAM)",           1, 6, 6,
  "IADC - WELLSHARP WELL SERVICING COILED TUBING (RETAKE EXAM)", 1, 6, 6,
  "IADC - WELLSHARP WELL SERVICING WIRELINE (RETAKE EXAM)",      1, 6, 6,
  "IADC - WELLSHARP WELL SERVICING WORKOVER (RETAKE EXAM)",      1, 6, 6,
  "IADC - WELLSHARP WELL SERVICING SNUBBING (RETAKE EXAM)",      1, 6, 6
)



# ============================================================================ #
# QIDDIYA ACADEMY (QCTA) + TAKAMOL — CONFIG, PARSER, MANUAL ENTRY STORE
# ----------------------------------------------------------------------------
# Nothing below changes any existing dataset, filter or calculation.
# ============================================================================ #

QIDDIYA_COLOR <- "#6A1B9A"   # purple accent for Qiddiya
TAKAMOL_COLOR <- "#00796B"   # teal accent for Takamol

# Folders that are scanned for Qiddiya utilization workbooks.
# Any .xlsx whose file name contains "QCTA" or "Qiddiya" is picked up
# automatically, so you only need to drop next month's file in the folder.
QIDDIYA_SEARCH_DIRS  <- c(".", "data", "Qiddiya", "qiddiya", "QCTA")
QIDDIYA_FILE_PATTERN <- "qcta|qiddiya"

# Manual numbers are stored as CSV so they survive an app restart.
MANUAL_DIR          <- "manual_entries"
QIDDIYA_MANUAL_FILE <- file.path(MANUAL_DIR, "qiddiya_manual_entries.csv")
TAKAMOL_MANUAL_FILE <- file.path(MANUAL_DIR, "takamol_manual_entries.csv")

MONTH_CHOICES <- stats::setNames(1:12, month.name)

# ---------------------- MANUAL ENTRY STORE ---------------------- #
empty_manual_tbl <- function() {
  tibble(
    ID           = character(),
    Year         = numeric(),
    Month        = numeric(),
    Participants = numeric(),
    Sessions     = numeric(),
    TeachingDays = numeric(),
    Note         = character(),
    AddedOn      = character()
  )
}

read_manual_entries <- function(path) {
  if (!file.exists(path)) return(empty_manual_tbl())
  out <- tryCatch(utils::read.csv(path, stringsAsFactors = FALSE, colClasses = "character"),
                  error = function(e) NULL)
  if (is.null(out) || nrow(out) == 0) return(empty_manual_tbl())
  tmpl <- empty_manual_tbl()
  for (nm in names(tmpl)) if (!nm %in% names(out)) out[[nm]] <- NA
  out <- out[, names(tmpl), drop = FALSE]
  suppressWarnings(
    as_tibble(out) %>%
      mutate(
        ID           = as.character(ID),
        Year         = as.numeric(Year),
        Month        = as.numeric(Month),
        Participants = as.numeric(Participants),
        Sessions     = as.numeric(Sessions),
        TeachingDays = as.numeric(TeachingDays),
        Note         = as.character(Note),
        AddedOn      = as.character(AddedOn)
      )
  )
}

write_manual_entries <- function(df, path) {
  tryCatch({
    dir.create(dirname(path), showWarnings = FALSE, recursive = TRUE)
    utils::write.csv(df, path, row.names = FALSE, na = "")
    TRUE
  }, error = function(e) FALSE)
}

# Adds PeriodDate / PeriodLabel and replaces NA numbers with 0
manual_with_dates <- function(df) {
  if (is.null(df) || nrow(df) == 0) {
    return(empty_manual_tbl() %>%
             mutate(PeriodDate = as.Date(character()), PeriodLabel = character()))
  }
  df %>%
    mutate(
      Year         = ifelse(is.na(Year), as.numeric(format(Sys.Date(), "%Y")), Year),
      Month        = ifelse(is.na(Month) | Month < 1 | Month > 12, 1, Month),
      Participants = ifelse(is.na(Participants), 0, Participants),
      Sessions     = ifelse(is.na(Sessions), 0, Sessions),
      TeachingDays = ifelse(is.na(TeachingDays), 0, TeachingDays),
      PeriodDate   = as.Date(sprintf("%04d-%02d-01", as.integer(Year), as.integer(Month))),
      PeriodLabel  = format(PeriodDate, "%b %Y")
    )
}

# Keep manual rows whose month overlaps the [start, end] window
filter_manual_window <- function(df, start, end) {
  d <- manual_with_dates(df)
  if (nrow(d) == 0) return(d)
  if (is.null(start) || is.null(end)) return(d)
  m_start <- d$PeriodDate
  m_end   <- ceiling_date(d$PeriodDate, "month") - days(1)
  d[m_start <= as.Date(end) & m_end >= as.Date(start), , drop = FALSE]
}

# ---------------------- QIDDIYA WORKBOOK PARSER ---------------------- #
# The QCTA workbook is a calendar grid: one column per day, and for every
# class a block of three rows (Instructor Name / Course Name / Number of
# Students). A course that runs several days is merged across those columns,
# so a non-empty course cell = one session and a non-empty instructor cell =
# one teaching day. That reproduces the workbook's own totals exactly.

qd_clean_chr <- function(x) {
  x <- as.character(x)
  x[is.na(x)] <- ""
  str_squish(x)
}

qd_to_date <- function(x) {
  x   <- qd_clean_chr(x)
  out <- rep(as.Date(NA), length(x))
  num <- suppressWarnings(as.numeric(x))
  ok  <- !is.na(num) & num > 20000 & num < 80000
  out[ok] <- as.Date(num[ok], origin = "1899-12-30")
  rest <- which(is.na(out) & nzchar(x))
  for (i in rest) {
    d2 <- suppressWarnings(tryCatch(as.Date(x[i]), error = function(e) as.Date(NA)))
    if (length(d2) == 1) out[i] <- d2
  }
  out
}

parse_qiddiya_sheet <- function(path, sheet) {
  raw <- tryCatch(
    suppressMessages(read_excel(path, sheet = sheet, col_names = FALSE,
                                col_types = "text", .name_repair = "minimal")),
    error = function(e) NULL)
  if (is.null(raw) || nrow(raw) < 4 || ncol(raw) < 3) return(NULL)
  
  m <- as.matrix(raw)
  m[is.na(m)] <- ""
  m <- apply(m, 2, qd_clean_chr)
  if (is.null(dim(m))) return(NULL)
  nr <- nrow(m); nc <- ncol(m)
  
  # locate the row holding the calendar dates
  date_row <- NA_integer_; best <- 0
  for (i in seq_len(min(nr, 12))) {
    k <- sum(!is.na(qd_to_date(m[i, ])))
    if (k > best) { best <- k; date_row <- i }
  }
  if (is.na(date_row) || best < 5) return(NULL)
  dates <- qd_to_date(m[date_row, ])
  
  # ignore the Standby / Total block at the bottom
  labels  <- tolower(m[, 1])
  stop_at <- which(labels %in% c("standby", "standby trainers", "total"))
  stop_at <- stop_at[stop_at > date_row]
  last_row <- if (length(stop_at)) min(stop_at) - 1 else nr
  
  instr_rows <- which(str_detect(labels, "^instructor name") & seq_len(nr) <= last_row)
  if (!length(instr_rows)) return(NULL)
  
  sess_list <- list(); day_list <- list()
  
  for (ir in instr_rows) {
    cr <- ir + 1; sr <- ir + 2
    if (sr > nr) next
    if (!str_detect(labels[cr], "^course name")) next
    if (!str_detect(labels[sr], "number of student")) next
    
    # class label = nearest non-empty label above that is not a field name
    grp <- "Unassigned"
    j <- ir - 1
    while (j >= 1) {
      lb <- m[j, 1]
      if (nzchar(lb) &&
          !str_detect(tolower(lb), "^(instructor name|course name|number of student)")) {
        grp <- lb; break
      }
      j <- j - 1
    }
    
    instr <- m[ir, ]; crs <- m[cr, ]
    stu   <- suppressWarnings(as.numeric(m[sr, ]))
    
    for (cc in seq_len(nc)) {
      if (is.na(dates[cc])) next
      
      if (nzchar(instr[cc])) {
        day_list[[length(day_list) + 1]] <- tibble(
          Date = dates[cc], Class = grp, Instructor = instr[cc])
      }
      
      if (nzchar(crs[cc])) {
        len <- 1; k <- cc + 1
        while (k <= nc && !is.na(dates[k]) && !nzchar(crs[k]) && nzchar(instr[k])) {
          len <- len + 1; k <- k + 1
        }
        sess_list[[length(sess_list) + 1]] <- tibble(
          Date        = dates[cc],
          Class       = grp,
          Course      = crs[cc],
          Instructor  = if (nzchar(instr[cc])) instr[cc] else "Not recorded",
          Students    = if (is.na(stu[cc])) 0 else stu[cc],
          SessionDays = len)
      }
    }
  }
  
  if (!length(sess_list) && !length(day_list)) return(NULL)
  list(
    sessions = if (length(sess_list)) bind_rows(sess_list) else NULL,
    days     = if (length(day_list))  bind_rows(day_list)  else NULL
  )
}

qiddiya_files <- function() {
  fs <- character()
  for (dd in QIDDIYA_SEARCH_DIRS) {
    if (!dir.exists(dd)) next
    fs <- c(fs, list.files(dd, pattern = "\\.xlsx$", full.names = TRUE, ignore.case = TRUE))
  }
  fs <- unique(normalizePath(fs, winslash = "/", mustWork = FALSE))
  bn <- basename(fs)
  fs[grepl(QIDDIYA_FILE_PATTERN, bn, ignore.case = TRUE) & !grepl("^~\\$", bn)]
}

load_qiddiya_all <- function() {
  fs <- qiddiya_files()
  if (!length(fs)) return(NULL)
  
  sess <- list(); dys <- list()
  for (f in fs) {
    sheets <- tryCatch(excel_sheets(f), error = function(e) character())
    for (sh in sheets) {
      r <- parse_qiddiya_sheet(f, sh)
      if (is.null(r)) next
      if (!is.null(r$sessions))
        sess[[length(sess) + 1]] <- r$sessions %>%
          mutate(SourceFile = basename(f), SourceSheet = sh)
      if (!is.null(r$days))
        dys[[length(dys) + 1]] <- r$days %>%
          mutate(SourceFile = basename(f), SourceSheet = sh)
    }
  }
  if (!length(sess) && !length(dys)) return(NULL)
  
  s <- if (length(sess)) bind_rows(sess) else NULL
  d <- if (length(dys))  bind_rows(dys)  else NULL
  
  # Safety net: if the same month is present in two workbooks (e.g. an
  # "updated" copy), identical sessions/days are counted only once.
  if (!is.null(s)) s <- s %>% distinct(Date, Class, Course, .keep_all = TRUE)
  if (!is.null(d)) d <- d %>% distinct(Date, Class, Instructor, .keep_all = TRUE)
  
  list(sessions = s, days = d, files = basename(fs))
}

# ---------------------- HSE COURSE KEYWORDS ---------------------- #
# Edit this list to match your actual HSE course names
HSE_KEYWORDS <- c("HSE", "SAFETY", "ENVIRONMENT", "HEALTH", "RISK", 
                  "OSHA", "FIRST AID", "FIRE", "ERGONOMICS", "COSH", 
                  "CONFINED SPACE", "WORK AT HEIGHT", "PTW", "ENVIRONMENTAL")

# ---------------------- FUNCTIONS ---------------------- #
load_data_local <- function() {
  df <- tryCatch({ read_excel(FILE_PATH) }, error = function(e) { return(NULL) })
  if (is.null(df)) return(NULL)
  if (length(setdiff(required_columns, names(df))) > 0) return(NULL)
  df[["Actual Date"]] <- as.Date(df[["Actual Date"]])
  df
}

get_google_sheet_tab <- function(sheet_name) {
  temp_file <- tempfile(fileext = ".xlsx")
  tryCatch({ download.file(GOOGLE_XLSX_URL, destfile = temp_file, mode = "wb") }, error = function(e) { return(NULL) })
  if (!file.exists(temp_file)) return(NULL)
  tryCatch({ read_excel(temp_file, sheet = sheet_name) }, error = function(e) { return(NULL) })
}

# --- Course Name Normalization (WellSharp) ---
normalize_wellsharp_course <- function(x) {
  x %>%
    toupper() %>%
    str_squish() %>%
    str_replace("\\s*\\+\\s*STUCK PIPE AVOIDANCE COURSE\\s*$", "") %>%
    str_replace_all("SUPERVIOSR", "SUPERVISORY") %>%
    str_replace_all("SUPERVIOSRY", "SUPERVISORY")
}

# --- Identify HSE courses (case‑insensitive keyword match, excluding WellSharp) ---
is_hse_course <- function(course_names) {
  wellsharp_keys <- wellsharp_hours$CourseName %>% normalize_wellsharp_course() %>% unique()
  wellsharp_match <- normalize_wellsharp_course(course_names) %in% wellsharp_keys
  !wellsharp_match
}

# --- Time bucketing helper for charts ---
period_floor <- function(d, mode) {
  mode <- tolower(mode %||% "daily")
  if (mode == "weekly") return(floor_date(d, unit = "week"))
  if (mode == "monthly") return(floor_date(d, unit = "month"))
  if (mode == "yearly") return(floor_date(d, unit = "year"))
  floor_date(d, unit = "day")
}

aggregate_data <- function(data, group_col) {
  data %>% group_by(.data[[group_col]]) %>% 
    summarize(Participants = n(), Sessions = n_distinct(`Actual Sessions`), .groups = "drop") %>% 
    rename(Group = .data[[group_col]])
}

# Helper: standard plotly layout for visible labels
chart_margin_h <- list(l = 200, r = 100, t = 40, b = 50)
chart_margin_v <- list(l = 70, r = 50, t = 50, b = 120)

# ---------------------- UI ---------------------- #
ui <- page_navbar(
  title = div(
    style = "display: flex; align-items: center; padding: 5px 0;",
    img(src = "https://neftenergies.com/wp-content/uploads/2022/07/neftanimated700x420.gif", height = "35px", style = "margin-right: 12px;"),
    span("NEFT Training Analytics", style = "font-weight: 700; font-size: 20px; color: #002147;")
  ),
  theme = neft_theme,
  fillable = FALSE,
  
  # === SIDEBAR (unchanged) ===
  sidebar = sidebar(
    width = 280,
    class = "bg-primary",
    open = "always",
    
    tags$style(HTML("
      .bslib-sidebar-layout .sidebar {
        background-color: #002147 !important;
      }
      .bslib-sidebar-layout .sidebar label {
        color: white !important;
        font-weight: 500;
        margin-bottom: 8px;
      }
      .bslib-sidebar-layout .sidebar .form-control {
        background-color: white;
        border: 1px solid #dee2e6;
      }
      .bslib-sidebar-layout .sidebar .selectize-input {
        background-color: white;
        border: 1px solid #dee2e6;
      }
      #period_label_sub {
        color: white !important;
      }
    ")),
    
    div(class = "mb-4",
        h5("FILTERS & CONTROLS", 
           style = "color: #FFC000; font-size: 11px; font-weight: 700; 
                    letter-spacing: 1px; border-bottom: 2px solid #FFC000; 
                    padding-bottom: 8px; margin-bottom: 20px;")
    ),
    
    div(
      tags$label("Date Range", style = "color: white; font-weight: 500; margin-bottom: 8px;"),
      dateRangeInput("date_picker", NULL,
                     start = Sys.Date() - 7, end = Sys.Date(),
                     width = "100%")
    ),
    
    div(
      tags$label("Charts View", style = "color: white; font-weight: 500; margin-bottom: 8px;"),
      selectInput("chart_granularity", NULL,
                  choices = c("Daily" = "daily",
                              "Weekly" = "weekly",
                              "Monthly" = "monthly",
                              "Yearly" = "yearly"),
                  selected = "daily",
                  width = "100%")
    ),
    
    div(
      tags$label("Quick Select", style = "color: white; font-weight: 500; margin-bottom: 8px;"),
      selectInput("time_context", NULL,
                  choices = c("Custom Range" = "custom", 
                              "This Month" = "monthly", 
                              "This Year" = "yearly"),
                  width = "100%")
    ),
    
    div(
      tags$label("Filter by Client", style = "color: white; font-weight: 500; margin-bottom: 8px;"),
      selectizeInput("client_filter", NULL,
                     choices = NULL, multiple = TRUE, width = "100%")
    ),
    
    div(
      tags$label("Filter by Course", style = "color: white; font-weight: 500; margin-bottom: 8px;"),
      selectizeInput("course_filter", NULL,
                     choices = NULL, multiple = TRUE, width = "100%")
    ),
    
    hr(style = "border-color: rgba(255, 192, 0, 0.3); margin: 20px 0;"),
    
    div(
      tags$label("Year for Analysis", style = "color: white; font-weight: 500; margin-bottom: 8px;"),
      selectInput("year_filter", NULL,
                  choices = c("2023", "2024", "2025","2026"), 
                  selected = "2026",
                  width = "100%")
    ),
    
    hr(style = "border-color: rgba(255, 192, 0, 0.3); margin: 20px 0;"),
    
    downloadButton("downloadReport", "Generate PDF Report", 
                   class = "btn-warning mb-2", 
                   style = "width: 100%; font-weight: 600; color: #002147;"),
    
    downloadButton("downloadData", "Export Data (CSV)", 
                   class = "btn-light", 
                   style = "width: 100%; font-weight: 600; color: #002147;")
  ),
  
  # ============================================
  # TAB 1: EXECUTIVE SUMMARY (enhanced)
  # ============================================
  nav_panel(
    title = "Executive Summary",
    icon = icon("gauge-high"),
    
    # Header Card
    div(class = "container-fluid p-0 mb-4",
        card(
          class = "border-0 shadow-sm",
          card_body(
            class = "text-center",
            style = "background: linear-gradient(135deg, #002147 0%, #003d7a 100%); 
                     border-radius: 10px; padding: 25px;",
            h3(textOutput("period_label_header"), 
               style = "color: #FFC000 !important; font-weight: 700; margin: 0; font-size: 1.8rem;"),
            tags$p(
              textOutput("period_label_sub"),
              style = "color: white !important; margin: 5px 0 0 0 !important; 
                       font-size: 1.1rem !important; font-weight: 600 !important;"
            )
          )
        )
    ),
    
    # KPI Cards Row (original)
    layout_columns(
      col_widths = c(4, 4, 4),
      fill = FALSE,
      
      value_box(
        title = "Total Participants",
        value = uiOutput("kpi_participants_dyn"),
        showcase = bs_icon("people-fill"),
        theme = "primary",
        height = "140px",
        uiOutput("kpi_participants_delta")
      ),
      
      value_box(
        title = "Unique Sessions",
        value = uiOutput("kpi_sessions_dyn"),
        showcase = bs_icon("calendar-event"),
        theme = "secondary",
        height = "140px",
        uiOutput("kpi_sessions_delta")
      ),
      
      value_box(
        title = "Avg Class Size",
        value = uiOutput("kpi_efficiency_dyn"),
        showcase = bs_icon("speedometer2"),
        theme = "light",
        height = "140px",
        p("Students per Session", style = "font-size: 0.85rem; color: #6c757d;")
      )
    ),
    
    # --- NEW: WellSharp Summary Section ---
    div(class = "mt-4 mb-4",
        card(
          full_screen = TRUE,
          height = "220px",
          card_header("WellSharp at a Glance", class = "fw-bold bg-dark text-white"),
          card_body(
            layout_columns(
              col_widths = c(3, 3, 3, 3),
              value_box(
                title = "WellSharp Courses",
                value = uiOutput("wellsharp_summary_courses"),
                showcase = bs_icon("mortarboard"),
                theme = "primary",
                height = "140px"
              ),
              value_box(
                title = "WellSharp Participants",
                value = uiOutput("wellsharp_summary_participants"),
                showcase = bs_icon("people"),
                theme = "secondary",
                height = "140px",
                uiOutput("wellsharp_summary_delta")
              ),
              value_box(
                title = "vs Prior Period",
                value = uiOutput("wellsharp_summary_vs_prior"),
                showcase = bs_icon("arrow-up-short"),
                theme = "warning",
                height = "140px"
              ),
              value_box(
                title = "% of Total Participants",
                value = uiOutput("wellsharp_summary_pct"),
                showcase = bs_icon("pie-chart"),
                theme = "light",
                height = "140px"
              )
            )
          )
        )
    ),
    
    # --- NEW: Special Projects (Qiddiya Academy & Takamol) ---
    tags$style(HTML("
      .projects-scope .form-check-label { color: #FFFFFF !important; font-size: 0.82rem; }
      .projects-scope .shiny-input-radiogroup { margin-bottom: 0 !important; }
      .projects-scope .form-check { margin-right: 14px; }
    ")),
    div(class = "mt-4 mb-4",
        card(
          full_screen = TRUE,
          card_header(
            div(class = "d-flex justify-content-between align-items-center flex-wrap gap-2",
                span("Special Projects - Qiddiya Academy & Takamol", class = "fw-bold"),
                div(class = "projects-scope",
                    radioButtons("project_scope", NULL,
                                 choices = c("Cumulative (all records)" = "all",
                                             "Selected period only"     = "period"),
                                 selected = "all", inline = TRUE)
                )
            ),
            class = "bg-primary text-white"
          ),
          card_body(
            layout_columns(
              col_widths = c(3, 3, 3, 3),
              value_box(
                title = "Qiddiya Participants",
                value = uiOutput("exec_qd_participants"),
                showcase = bs_icon("building"),
                theme = "primary",
                height = "140px",
                uiOutput("exec_qd_sub")
              ),
              value_box(
                title = "Takamol Participants",
                value = uiOutput("exec_tk_participants"),
                showcase = bs_icon("diagram-3"),
                theme = "secondary",
                height = "140px",
                uiOutput("exec_tk_sub")
              ),
              value_box(
                title = "Grand Total Participants",
                value = uiOutput("exec_grand_participants"),
                showcase = bs_icon("people-fill"),
                theme = "light",
                height = "140px",
                uiOutput("exec_grand_participants_sub")
              ),
              value_box(
                title = "Grand Total Sessions",
                value = uiOutput("exec_grand_sessions"),
                showcase = bs_icon("calendar2-check"),
                theme = "light",
                height = "140px",
                uiOutput("exec_grand_sessions_sub")
              )
            ),
            uiOutput("exec_projects_note")
          )
        )
    ),
    
    # Charts Row (original)
    layout_columns(
      col_widths = c(6, 6),
      
      card(
        full_screen = TRUE,
        height = "500px",
        card_header("Daily Activity Trend", class = "fw-bold"),
        card_body(plotlyOutput("dynamic_trend_area", height = "420px"))
      ),
      
      card(
        full_screen = TRUE,
        height = "500px",
        card_header("Top Clients", class = "fw-bold"),
        card_body(plotlyOutput("dynamic_clients_bar", height = "420px"))
      )
    ),
    
    # --- NEW: Monthly Participants Bar Chart (Key Metric) ---
    card(
      full_screen = TRUE,
      height = "450px",
      card_header("Monthly Participants (Selected Year)", class = "fw-bold bg-primary text-white"),
      card_body(
        plotlyOutput("exec_monthly_participants", height = "380px")
      )
    ),
    
    # Instructor Capacity Overview (unchanged)
    card(
      full_screen = TRUE,
      height = "550px",
      card_header("Instructor Capacity Overview", class = "fw-bold bg-primary text-white"),
      card_body(
        p("Active instructor workload distribution and performance metrics", 
          class = "text-muted small mb-3"),
        layout_columns(
          col_widths = c(7, 5),
          
          div(
            h6("Top 10 Instructors - Sessions & Participants", class = "fw-bold mb-3"),
            plotlyOutput("instructor_workload_chart", height = "400px")
          ),
          
          div(
            h6("Capacity Metrics", class = "fw-bold mb-3"),
            uiOutput("instructor_capacity_metrics")
          )
        )
      )
    )
  ),
  
  # ============================================
  # TAB 2: YEAR OVER YEAR (unchanged)
  # ============================================
  nav_panel(
    title = "Year-over-Year",
    icon = icon("chart-line"),
    
    div(class = "alert alert-info mb-4",
        icon("info-circle"), 
        strong(" Multi-Year Analysis:"),
        " Compare performance across 2023, 2024, and 2025."
    ),
    
    h4("Annual Performance Comparison", class = "mb-3 fw-bold text-primary"),
    
    layout_columns(
      col_widths = c(6, 6),
      
      card(
        full_screen = TRUE,
        height = "550px",
        card_header("Total Participants by Year", class = "fw-bold bg-primary text-white"),
        card_body(plotlyOutput("yearly_participants_chart", height = "470px"))
      ),
      
      card(
        full_screen = TRUE,
        height = "550px",
        card_header("Total Sessions by Year", class = "fw-bold bg-warning"),
        card_body(
          p("Note: Session data not available for 2023", 
            class = "text-muted small fst-italic mb-2"),
          plotlyOutput("yearly_sessions_chart", height = "440px")
        )
      )
    ),
    
    h4("Monthly Analysis", class = "mb-3 mt-5 fw-bold text-primary"),
    p(class = "text-muted mb-4", 
      icon("filter"), 
      " Use the 'Year for Analysis' filter in the sidebar to select which year to view."),
    
    layout_columns(
      col_widths = c(6, 6),
      
      card(
        full_screen = TRUE,
        height = "550px",
        card_header(textOutput("monthly_participants_title"), class = "fw-bold bg-primary text-white"),
        card_body(plotlyOutput("monthly_participants_chart", height = "470px"))
      ),
      
      card(
        full_screen = TRUE,
        height = "550px",
        card_header(textOutput("monthly_sessions_title"), class = "fw-bold bg-warning"),
        card_body(
          uiOutput("monthly_sessions_note"),
          plotlyOutput("monthly_sessions_chart", height = "440px")
        )
      )
    )
  ),
  
  # ============================================
  # TAB 3: HSE (formerly Strategic Insights)
  # ============================================
  nav_panel(
    title = "HSE",
    icon = icon("shield"),
    
    div(class = "alert alert-success mb-4",
        icon("leaf"), 
        strong(" Health, Safety & Environment Training"),
        " – All charts reflect HSE courses only (based on keyword list)."
    ),
    
    # --- HSE Summary Metrics ---
    h4("HSE at a Glance", class = "mb-3 fw-bold text-success"),
    layout_columns(
      col_widths = c(3, 3, 3, 3),
      value_box(
        title = "HSE Courses",
        value = uiOutput("hse_courses_count"),
        showcase = bs_icon("book"),
        theme = "success",
        height = "120px"
      ),
      value_box(
        title = "HSE Participants",
        value = uiOutput("hse_participants_count"),
        showcase = bs_icon("people"),
        theme = "primary",
        height = "120px"
      ),
      value_box(
        title = "Avg Pass Rate",
        value = uiOutput("hse_pass_rate"),  # placeholder – requires actual pass data
        showcase = bs_icon("check-circle"),
        theme = "warning",
        height = "120px"
      ),
      value_box(
        title = "HSE Training Hours",
        value = uiOutput("hse_hours"),
        showcase = bs_icon("clock"),
        theme = "light",
        height = "120px"
      )
    ),
    
    hr(),
    
    # --- Top 10 Lists (with second tier) ---
    h4("Top 10 HSE Clients", class = "mb-3 fw-bold text-success"),
    layout_columns(
      col_widths = c(6, 6),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Top 10 Clients by Participants", class = "fw-bold bg-success text-white"),
        card_body(plotlyOutput("hse_top10_clients", height = "420px"))
      ),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Next 10 Clients (11-20)", class = "fw-bold"),
        card_body(plotlyOutput("hse_next10_clients", height = "420px"))
      )
    ),
    
    h4("Top 10 HSE Courses", class = "mb-3 mt-4 fw-bold text-success"),
    layout_columns(
      col_widths = c(6, 6),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Top 10 Courses by Enrollment", class = "fw-bold bg-success text-white"),
        card_body(plotlyOutput("hse_top10_courses", height = "420px"))
      ),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Next 10 Courses (11-20)", class = "fw-bold"),
        card_body(plotlyOutput("hse_next10_courses", height = "420px"))
      )
    ),
    
    h4("Top 10 HSE Instructors", class = "mb-3 mt-4 fw-bold text-success"),
    layout_columns(
      col_widths = c(6, 6),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Top 10 Instructors by Participants", class = "fw-bold bg-success text-white"),
        card_body(plotlyOutput("hse_top10_instructors", height = "420px"))
      ),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Next 10 Instructors (11-20)", class = "fw-bold"),
        card_body(plotlyOutput("hse_next10_instructors", height = "420px"))
      )
    ),
    
    hr(),
    
    # --- HSE Performance Trends ---
    h4("HSE Trends", class = "mb-3 fw-bold text-success"),
    layout_columns(
      col_widths = c(6, 6),
      card(
        full_screen = TRUE, height = "500px",
        card_header("HSE Participants Over Time", class = "fw-bold bg-success text-white"),
        card_body(plotlyOutput("hse_trend_participants", height = "420px"))
      ),
      card(
        full_screen = TRUE, height = "500px",
        card_header("HSE Sessions Over Time", class = "fw-bold"),
        card_body(plotlyOutput("hse_trend_sessions", height = "420px"))
      )
    )
  ),
  
  # ============================================
  # TAB 4: WELLSHARP (unchanged from original)
  # ============================================
  nav_panel(
    title = "WellSharp",
    icon = icon("hard-hat"),
    
    div(class = "alert alert-info mb-4",
        icon("award"),
        strong(" WellSharp Course Analysis: "),
        "Top instructors by teaching hours for IADC WellSharp courses."
    ),
    
    # WellSharp Course Reference Table
    card(
      full_screen = TRUE,
      height = "380px",
      card_header("WellSharp Course Hours Reference", class = "fw-bold bg-dark text-white"),
      card_body(
        DT::dataTableOutput("wellsharp_ref_table", height = "300px")
      )
    ),
    
    # ---- WellSharp Period Charts (driven by sidebar Charts View) ----
    h4("WellSharp Period Analysis", class = "mb-3 mt-4 fw-bold text-primary"),
    p(class = "text-muted mb-3",
      icon("info-circle"),
      " Use the 'Charts View' selector in the sidebar. Weekly uses the date range (weeks start Friday). Monthly uses 'Year for Analysis'. Yearly shows all years."),
    
    layout_columns(
      col_widths = c(6, 6),
      card(full_screen = TRUE, height = "500px",
           card_header(textOutput("ws_period_hours_title"), class = "fw-bold bg-primary text-white"),
           card_body(plotlyOutput("ws_period_hours_chart", height = "420px"))
      ),
      card(full_screen = TRUE, height = "500px",
           card_header(textOutput("ws_period_sessions_title"), class = "fw-bold bg-warning"),
           card_body(plotlyOutput("ws_period_sessions_chart", height = "420px"))
      )
    ),
    
    hr(class = "my-4"),
    
    # Shared charts below — react to selected period tab
    h5(textOutput("ws_period_label"), class = "mb-3 fw-bold text-primary"),
    
    # Top 6 Instructors + Summary
    layout_columns(
      col_widths = c(7, 5),
      
      card(
        full_screen = TRUE, height = "550px",
        card_header("Top 6 Instructors by Teaching Hours", class = "fw-bold bg-primary text-white"),
        card_body(
          p("Teaching hours = sessions × course hours", class = "text-muted small mb-2"),
          plotlyOutput("wellsharp_top_instructors_chart", height = "460px")
        )
      ),
      
      card(
        full_screen = TRUE, height = "550px",
        card_header("WellSharp Summary", class = "fw-bold bg-warning"),
        card_body(uiOutput("wellsharp_summary_metrics"))
      )
    ),
    
    # Course Breakdown + Retake Analysis
    layout_columns(
      col_widths = c(6, 6),
      
      card(
        full_screen = TRUE, height = "600px",
        card_header("Course Breakdown by Instructor", class = "fw-bold"),
        card_body(plotlyOutput("wellsharp_course_breakdown_chart", height = "520px"))
      ),
      
      card(
        full_screen = TRUE, height = "600px",
        card_header("Course Retakes Analysis", class = "fw-bold bg-danger text-white"),
        card_body(
          p("Participants who took Retake Exam", class = "text-muted small mb-2"),
          plotlyOutput("wellsharp_retake_chart", height = "250px"),
          hr(),
          DT::dataTableOutput("wellsharp_retake_table", height = "200px")
        )
      )
    ),
    
    # Top 5 WellSharp Clients
    h4("Top 5 WellSharp Clients", class = "mb-3 mt-4 fw-bold text-primary"),
    card(
      full_screen = TRUE, height = "500px",
      card_header("Top 5 Clients by Participants", class = "fw-bold bg-primary text-white"),
      card_body(
        p("Clients with highest WellSharp participant counts (includes retakes)", class = "text-muted small mb-2"),
        plotlyOutput("wellsharp_top5_clients_chart", height = "420px")
      )
    ),
    
    # Instructors vs Participants Chart
    card(
      full_screen = TRUE, height = "600px",
      card_header("Instructors vs No. of Participants Taught", class = "fw-bold bg-primary text-white"),
      card_body(
        p("Total participants trained per WellSharp instructor", class = "text-muted small mb-2"),
        plotlyOutput("wellsharp_instructor_participants_chart", height = "520px")
      )
    ),
    
    # Detailed Table
    card(
      full_screen = TRUE, height = "500px",
      card_header("Instructor Detail Table", class = "fw-bold bg-dark text-white"),
      card_body(DT::dataTableOutput("wellsharp_detail_table"))
    )
  ),
  
  # ============================================
  # TAB: QIDDIYA ACADEMY (QCTA)
  # ============================================
  nav_panel(
    title = "Qiddiya Academy",
    icon = icon("building"),
    
    div(class = "alert alert-secondary mb-4",
        icon("circle-info"),
        strong(" Qiddiya Academy (QCTA): "),
        "Figures are read automatically from the QCTA trainer-utilization workbooks ",
        "and combined with any numbers you add manually below. ",
        "This tab is independent of the sidebar filters."
    ),
    
    # --- Controls ---
    card(
      class = "mb-4",
      card_body(
        layout_columns(
          col_widths = c(4, 4, 4),
          div(
            tags$label("Period", class = "fw-bold small"),
            selectInput("qd_period", NULL, choices = c("All periods" = "all"), width = "100%")
          ),
          div(
            tags$label("Include manual entries", class = "fw-bold small"),
            selectInput("qd_include_manual", NULL,
                        choices = c("Yes - workbook + manual" = "yes",
                                    "No - workbook only"      = "no"),
                        selected = "yes", width = "100%")
          ),
          div(
            tags$label("Data source", class = "fw-bold small"),
            div(actionButton("qd_reload", "Reload workbook files",
                             icon = icon("rotate"), class = "btn-outline-primary w-100")),
            div(class = "small text-muted mt-1", uiOutput("qd_files_note"))
          )
        )
      )
    ),
    
    # --- Headline KPIs ---
    layout_columns(
      col_widths = c(3, 3, 3, 3),
      value_box(
        title = "Participants Trained",
        value = uiOutput("qd_kpi_participants"),
        showcase = bs_icon("people-fill"),
        theme = "primary",
        height = "150px",
        uiOutput("qd_kpi_participants_sub")
      ),
      value_box(
        title = "Sessions Delivered",
        value = uiOutput("qd_kpi_sessions"),
        showcase = bs_icon("calendar2-check"),
        theme = "secondary",
        height = "150px",
        uiOutput("qd_kpi_sessions_sub")
      ),
      value_box(
        title = "Teaching Days",
        value = uiOutput("qd_kpi_days"),
        showcase = bs_icon("clock-history"),
        theme = "dark",
        height = "150px",
        uiOutput("qd_kpi_days_sub")
      ),
      value_box(
        title = "Avg Class Size",
        value = uiOutput("qd_kpi_avg"),
        showcase = bs_icon("speedometer2"),
        theme = "light",
        height = "150px",
        p("Participants per session", style = "font-size: 0.85rem; color: #6c757d;")
      )
    ),
    
    # --- Manual entry panel ---
    div(class = "mt-4 mb-4",
        card(
          card_header("Add Qiddiya Numbers Manually", class = "fw-bold bg-warning"),
          card_body(
            p(class = "text-muted small mb-3",
              icon("pen-to-square"),
              " Use this for months that are not yet in a workbook. Manual rows are saved to ",
              tags$code("manual_entries/qiddiya_manual_entries.csv"),
              " and are added on top of the workbook figures in this tab and in the Executive Summary."),
            layout_columns(
              col_widths = c(2, 2, 2, 2, 2, 2),
              numericInput("qd_m_year", "Year", value = as.numeric(format(Sys.Date(), "%Y")),
                           min = 2015, max = 2100, step = 1),
              selectInput("qd_m_month", "Month", choices = MONTH_CHOICES,
                          selected = as.numeric(format(Sys.Date(), "%m"))),
              numericInput("qd_m_participants", "Participants", value = 0, min = 0, step = 1),
              numericInput("qd_m_sessions", "Sessions", value = 0, min = 0, step = 1),
              numericInput("qd_m_days", "Teaching Days", value = 0, min = 0, step = 1),
              div(tags$label(HTML("&nbsp;"), class = "form-label d-block"),
                  actionButton("qd_m_add", "Add / Update",
                               icon = icon("plus"), class = "btn-primary w-100"))
            ),
            textInput("qd_m_note", "Note (optional)", width = "100%",
                      placeholder = "e.g. reported by QCTA operations"),
            hr(),
            h6("Manual entries on record", class = "fw-bold"),
            DT::dataTableOutput("qd_manual_table"),
            div(class = "mt-2",
                actionButton("qd_m_delete", "Delete selected row(s)",
                             icon = icon("trash"), class = "btn-outline-danger btn-sm"))
          )
        )
    ),
    
    # --- Charts ---
    layout_columns(
      col_widths = c(6, 6),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Participants by Month", class = "fw-bold bg-primary text-white"),
        card_body(plotlyOutput("qd_monthly_chart", height = "420px"))
      ),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Sessions & Teaching Days by Month", class = "fw-bold bg-warning"),
        card_body(plotlyOutput("qd_monthly_sessions_chart", height = "420px"))
      )
    ),
    
    layout_columns(
      col_widths = c(6, 6),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Top Instructors by Teaching Days", class = "fw-bold bg-primary text-white"),
        card_body(plotlyOutput("qd_instructor_chart", height = "420px"))
      ),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Top Courses by Participants", class = "fw-bold"),
        card_body(plotlyOutput("qd_course_chart", height = "420px"))
      )
    ),
    
    layout_columns(
      col_widths = c(6, 6),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Utilization by Class / Track", class = "fw-bold bg-dark text-white"),
        card_body(plotlyOutput("qd_class_chart", height = "420px"))
      ),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Daily Participants Trend", class = "fw-bold"),
        card_body(plotlyOutput("qd_daily_chart", height = "420px"))
      )
    ),
    
    card(
      full_screen = TRUE, height = "560px",
      card_header("Session Detail (from workbook)", class = "fw-bold bg-dark text-white"),
      card_body(DT::dataTableOutput("qd_detail_table"))
    )
  ),
  
  # ============================================
  # TAB: TAKAMOL PROJECT
  # ============================================
  nav_panel(
    title = "Takamol",
    icon = icon("handshake"),
    
    div(class = "alert alert-secondary mb-4",
        icon("circle-info"),
        strong(" Takamol Project: "),
        "All figures on this tab are entered manually. They are saved to ",
        tags$code("manual_entries/takamol_manual_entries.csv"),
        " and feed straight into the Executive Summary."
    ),
    
    layout_columns(
      col_widths = c(3, 3, 3, 3),
      value_box(
        title = "Participants Trained",
        value = uiOutput("tk_kpi_participants"),
        showcase = bs_icon("people-fill"),
        theme = "primary",
        height = "150px",
        uiOutput("tk_kpi_participants_sub")
      ),
      value_box(
        title = "Sessions Delivered",
        value = uiOutput("tk_kpi_sessions"),
        showcase = bs_icon("calendar2-check"),
        theme = "secondary",
        height = "150px",
        p("Optional - leave 0 if not tracked", style = "font-size: 0.8rem; color: #6c757d;")
      ),
      value_box(
        title = "Periods Recorded",
        value = uiOutput("tk_kpi_periods"),
        showcase = bs_icon("calendar3"),
        theme = "dark",
        height = "150px",
        uiOutput("tk_kpi_periods_sub")
      ),
      value_box(
        title = "Avg per Period",
        value = uiOutput("tk_kpi_avg"),
        showcase = bs_icon("graph-up"),
        theme = "light",
        height = "150px",
        p("Participants per recorded month", style = "font-size: 0.8rem; color: #6c757d;")
      )
    ),
    
    div(class = "mt-4 mb-4",
        card(
          card_header("Add Takamol Numbers", class = "fw-bold bg-warning"),
          card_body(
            p(class = "text-muted small mb-3",
              icon("pen-to-square"),
              " Enter the participants trained for a given month. Adding the same month twice ",
              "updates the existing row instead of duplicating it."),
            layout_columns(
              col_widths = c(2, 3, 2, 2, 3),
              numericInput("tk_m_year", "Year", value = as.numeric(format(Sys.Date(), "%Y")),
                           min = 2015, max = 2100, step = 1),
              selectInput("tk_m_month", "Month", choices = MONTH_CHOICES,
                          selected = as.numeric(format(Sys.Date(), "%m"))),
              numericInput("tk_m_participants", "Participants", value = 0, min = 0, step = 1),
              numericInput("tk_m_sessions", "Sessions (optional)", value = 0, min = 0, step = 1),
              div(tags$label(HTML("&nbsp;"), class = "form-label d-block"),
                  actionButton("tk_m_add", "Add / Update",
                               icon = icon("plus"), class = "btn-primary w-100"))
            ),
            textInput("tk_m_note", "Note (optional)", width = "100%",
                      placeholder = "e.g. Takamol batch 3 - Dammam"),
            hr(),
            h6("Takamol entries on record", class = "fw-bold"),
            DT::dataTableOutput("tk_manual_table"),
            div(class = "mt-2",
                actionButton("tk_m_delete", "Delete selected row(s)",
                             icon = icon("trash"), class = "btn-outline-danger btn-sm"))
          )
        )
    ),
    
    layout_columns(
      col_widths = c(7, 5),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Participants by Month", class = "fw-bold bg-primary text-white"),
        card_body(plotlyOutput("tk_monthly_chart", height = "420px"))
      ),
      card(
        full_screen = TRUE, height = "500px",
        card_header("Cumulative Participants", class = "fw-bold bg-warning"),
        card_body(plotlyOutput("tk_cumulative_chart", height = "420px"))
      )
    ),
    
    card(
      full_screen = TRUE, height = "450px",
      card_header("Participants by Year", class = "fw-bold bg-dark text-white"),
      card_body(plotlyOutput("tk_yearly_chart", height = "370px"))
    )
  ),
  
  # ============================================
  # TAB 5: QUALITY METRICS (unchanged)
  # ============================================
  nav_panel(
    title = "Quality Metrics",
    icon = icon("star"),
    
    layout_columns(
      col_widths = c(12),
      
      card(
        full_screen = TRUE,
        height = "400px",
        card_header("Instructor Performance Comparison", class = "fw-bold bg-primary text-white"),
        card_body(
          selectInput("question_choice_chart", "Select Metric:", 
                      choices = questions_map, width = "100%"),
          plotlyOutput("instructor_performance_chart", height = "300px")
        )
      )
    ),
    
    layout_columns(
      col_widths = c(12),
      
      card(
        full_screen = TRUE,
        height = "500px",
        card_header("Detailed Evaluation Scores", class = "fw-bold bg-warning"),
        card_body(
          selectInput("question_choice", "Select Metric:", 
                      choices = questions_map, width = "100%"),
          DT::dataTableOutput("question_table")
        )
      )
    )
  ),
  
  # ============================================
  # TAB 6: DATA TABLE (unchanged)
  # ============================================
  nav_panel(
    title = "Data Table",
    icon = icon("table"),
    
    card(
      height = "750px",
      card_header("Raw Data View", class = "fw-bold"),
      card_body(DT::dataTableOutput("raw_data_table"))
    )
  )
)

# ---------------------- SERVER ---------------------- #
server <- function(input, output, session) {
  
  # Load Data
  df_data_local <- reactive({ load_data_local() })
  
  # Filtered Data (for raw table, etc.)
  valid_filtered_df <- reactive({
    d <- df_data_local()
    if (is.null(d)) return(NULL)
    
    d <- d %>% filter(`Actual Date` >= input$date_picker[1] & `Actual Date` <= input$date_picker[2])
    
    if (!is.null(input$course_filter) && length(input$course_filter) > 0)
      d <- d %>% filter(`Course Name` %in% input$course_filter)
    
    if (!is.null(input$client_filter) && length(input$client_filter) > 0)
      d <- d %>% filter(Client %in% input$client_filter)
    
    d
  })
  
  # Data for charts based on Charts View
  chart_df <- reactive({
    d <- df_data_local()
    if (is.null(d)) return(NULL)
    
    mode <- tolower(input$chart_granularity %||% "daily")
    
    if (mode %in% c("monthly", "yearly")) {
      selected_yr <- as.numeric(input$year_filter)
      d <- d %>% filter(year(`Actual Date`) == selected_yr)
    } else {
      d <- d %>% filter(`Actual Date` >= input$date_picker[1] & `Actual Date` <= input$date_picker[2])
    }
    
    if (!is.null(input$course_filter) && length(input$course_filter) > 0)
      d <- d %>% filter(`Course Name` %in% input$course_filter)
    
    if (!is.null(input$client_filter) && length(input$client_filter) > 0)
      d <- d %>% filter(Client %in% input$client_filter)
    
    d
  })
  
  # Strategic Data (Year-based from year_filter) – used for many existing charts
  strategic_df <- reactive({
    d <- df_data_local()
    if (is.null(d)) return(NULL)
    
    selected_yr <- as.numeric(input$year_filter)
    d <- d %>% filter(year(`Actual Date`) == selected_yr)
    
    if (!is.null(input$client_filter) && length(input$client_filter) > 0)
      d <- d %>% filter(Client %in% input$client_filter)
    
    d
  })
  
  # Date-range filtered data for Strategic Daily/Weekly
  strategic_daterange_df <- reactive({
    d <- df_data_local()
    if (is.null(d)) return(NULL)
    
    d <- d %>% filter(`Actual Date` >= input$date_picker[1] & `Actual Date` <= input$date_picker[2])
    
    if (!is.null(input$client_filter) && length(input$client_filter) > 0)
      d <- d %>% filter(Client %in% input$client_filter)
    
    if (!is.null(input$course_filter) && length(input$course_filter) > 0)
      d <- d %>% filter(`Course Name` %in% input$course_filter)
    
    d
  })
  
  # Period Stats (for Executive Summary KPI comparisons)
  period_stats <- reactive({
    d <- df_data_local()
    if (is.null(d)) return(NULL)
    
    s_date <- input$date_picker[1]
    e_date <- input$date_picker[2]
    mode <- input$time_context
    
    cur_start <- s_date
    cur_end <- e_date
    prev_start <- s_date - as.numeric(e_date - s_date) - 1
    prev_end <- s_date - 1
    
    label_main <- paste0(format(s_date, "%d %b"), " - ", format(e_date, "%d %b %Y"))
    label_sub <- paste0("vs ", format(prev_start, "%d %b"), " - ", format(prev_end, "%d %b"))
    
    if (mode == "monthly") {
      cur_start <- floor_date(e_date, "month")
      cur_end <- ceiling_date(e_date, "month") - days(1)
      prev_start <- floor_date(cur_start - days(1), "month")
      prev_end <- ceiling_date(cur_start - days(1), "month") - days(1)
      label_main <- format(cur_start, "%B %Y")
      label_sub <- paste("vs", format(prev_start, "%B %Y"))
    }
    
    if (mode == "yearly") {
      cur_start <- floor_date(e_date, "year")
      cur_end <- ceiling_date(e_date, "year") - days(1)
      prev_start <- floor_date(cur_start - days(1), "year")
      prev_end <- ceiling_date(cur_start - days(1), "year") - days(1)
      label_main <- format(cur_start, "%Y")
      label_sub <- paste("vs", format(prev_start, "%Y"))
    }
    
    cur_df <- d %>% filter(`Actual Date` >= cur_start & `Actual Date` <= cur_end)
    prev_df <- d %>% filter(`Actual Date` >= prev_start & `Actual Date` <= prev_end)
    
    if (!is.null(input$client_filter) && length(input$client_filter) > 0) {
      cur_df <- cur_df %>% filter(Client %in% input$client_filter)
      prev_df <- prev_df %>% filter(Client %in% input$client_filter)
    }
    
    list(mode = mode, cur_df = cur_df, prev_df = prev_df, 
         label_main = label_main, label_sub = label_sub,
         cur_start = cur_start, cur_end = cur_end,
         prev_start = prev_start, prev_end = prev_end)
  })
  
  # --- WellSharp specific period stats (for Executive Summary) ---
  wellsharp_period_stats <- reactive({
    ps <- period_stats()
    if (is.null(ps)) return(NULL)
    
    wellsharp_keys <- wellsharp_hours$CourseName %>% normalize_wellsharp_course() %>% unique()
    
    cur_ws <- ps$cur_df %>%
      mutate(CourseKey = normalize_wellsharp_course(`Course Name`)) %>%
      filter(CourseKey %in% wellsharp_keys)
    
    prev_ws <- ps$prev_df %>%
      mutate(CourseKey = normalize_wellsharp_course(`Course Name`)) %>%
      filter(CourseKey %in% wellsharp_keys)
    
    list(cur = cur_ws, prev = prev_ws)
  })
  
  # --- HSE Data (filtered by chart mode, client, course) ---
  hse_df <- reactive({
    d <- df_data_local()
    if (is.null(d)) return(NULL)
    
    mode <- tolower(input$chart_granularity %||% "daily")
    
    if (mode %in% c("monthly", "yearly")) {
      selected_yr <- as.numeric(input$year_filter)
      d <- d %>% filter(year(`Actual Date`) == selected_yr)
    } else {
      d <- d %>% filter(`Actual Date` >= input$date_picker[1] & `Actual Date` <= input$date_picker[2])
    }
    
    # Apply client/course filters
    if (!is.null(input$client_filter) && length(input$client_filter) > 0)
      d <- d %>% filter(Client %in% input$client_filter)
    
    if (!is.null(input$course_filter) && length(input$course_filter) > 0)
      d <- d %>% filter(`Course Name` %in% input$course_filter)
    
    # Now filter for HSE courses
    d %>% filter(is_hse_course(`Course Name`))
  })
  
  # --- HSE Data with hours calculation (placeholder) ---
  hse_with_hours <- reactive({
    d <- hse_df()
    if (is.null(d) || nrow(d) == 0) return(NULL)
    # Placeholder: assume each HSE session = 8 hours
    d %>% mutate(EstimatedHours = 8)
  })
  
  # --- Yearly Comparison Data (unchanged) ---
  yearly_comparison_data <- reactive({
    d <- df_data_local()
    if (is.null(d)) return(NULL)
    
    yearly_excel <- d %>%
      mutate(Year = year(`Actual Date`)) %>%
      group_by(Year) %>%
      summarise(Participants = n(), Sessions = n_distinct(`Actual Sessions`), .groups = "drop")
    
    yearly_2023 <- data.frame(Year = 2023, Participants = total_2023_participants, Sessions = NA_integer_)
    
    bind_rows(yearly_2023, yearly_excel) %>% arrange(Year)
  })
  
  # --- Monthly Comparison Data (unchanged) ---
  monthly_comparison_data <- reactive({
    d <- df_data_local()
    selected_year <- as.numeric(input$year_filter)
    
    if (is.null(d)) return(NULL)
    
    if (selected_year == 2023) {
      return(manual_2023 %>%
               select(Month, Participants) %>%
               mutate(Sessions = NA_integer_, MonthLabel = format(Month, "%b %Y")))
    } else {
      return(d %>%
               filter(year(`Actual Date`) == selected_year) %>%
               mutate(Month = floor_date(`Actual Date`, "month")) %>%
               group_by(Month) %>%
               summarise(Participants = n(), Sessions = n_distinct(`Actual Sessions`), .groups = "drop") %>%
               arrange(Month) %>%
               mutate(MonthLabel = format(Month, "%b %Y")))
    }
  })
  
  # --- WellSharp Data (all years, unchanged) ---
  wellsharp_data <- reactive({
    d <- df_data_local()
    if (is.null(d)) return(NULL)
    
    hours_lookup <- wellsharp_hours %>%
      mutate(CourseKey = normalize_wellsharp_course(CourseName))
    
    d_ws <- d %>%
      mutate(CourseKey = normalize_wellsharp_course(`Course Name`)) %>%
      filter(CourseKey %in% hours_lookup$CourseKey)
    
    if (nrow(d_ws) == 0) return(NULL)
    
    d_ws <- d_ws %>%
      left_join(
        hours_lookup %>% select(CourseKey, Days, HoursPerDay, TotalHours),
        by = "CourseKey"
      )
    
    d_ws
  })
  
  # --- Update Filter Choices ---
  observeEvent(df_data_local(), {
    d <- df_data_local()
    if (!is.null(d)) {
      updateSelectizeInput(session, "course_filter", choices = sort(unique(d[["Course Name"]])), server = TRUE)
      updateSelectizeInput(session, "client_filter", choices = sort(unique(d[["Client"]])), server = TRUE)
      # Also update HSE tab filters if they exist (they reuse same inputs)
    }
  })
  
  # === EXECUTIVE SUMMARY OUTPUTS ===
  output$period_label_header <- renderText({ period_stats()$label_main })
  output$period_label_sub <- renderText({ period_stats()$label_sub })
  
  output$kpi_participants_dyn <- renderUI({
    ps <- period_stats()
    if (is.null(ps)) return("0")
    span(format(nrow(ps$cur_df), big.mark = ","), 
         style = "font-size: 2.5rem; font-weight: 700;")
  })
  
  output$kpi_participants_delta <- renderUI({
    ps <- period_stats()
    if (is.null(ps)) return(NULL)
    diff <- nrow(ps$cur_df) - nrow(ps$prev_df)
    color <- if (diff >= 0) "success" else "danger"
    icon_name <- if (diff >= 0) "arrow-up" else "arrow-down"
    div(class = paste0("text-", color, " fw-bold"),
        bs_icon(icon_name), paste(abs(diff), "vs prior"))
  })
  
  output$kpi_sessions_dyn <- renderUI({
    ps <- period_stats()
    if (is.null(ps)) return("0")
    span(format(n_distinct(ps$cur_df$`Actual Sessions`), big.mark = ","),
         style = "font-size: 2.5rem; font-weight: 700;")
  })
  
  output$kpi_sessions_delta <- renderUI({
    ps <- period_stats()
    if (is.null(ps)) return(NULL)
    diff <- n_distinct(ps$cur_df$`Actual Sessions`) - n_distinct(ps$prev_df$`Actual Sessions`)
    color <- if (diff >= 0) "success" else "danger"
    icon_name <- if (diff >= 0) "arrow-up" else "arrow-down"
    div(class = paste0("text-", color, " fw-bold"),
        bs_icon(icon_name), paste(abs(diff), "vs prior"))
  })
  
  output$kpi_efficiency_dyn <- renderUI({
    ps <- period_stats()
    if (is.null(ps) || n_distinct(ps$cur_df$`Actual Sessions`) == 0) return("N/A")
    val <- round(nrow(ps$cur_df) / n_distinct(ps$cur_df$`Actual Sessions`), 1)
    span(val, style = "font-size: 2.5rem; font-weight: 700;")
  })
  
  # --- WellSharp Summary Value Boxes ---
  output$wellsharp_summary_courses <- renderUI({
    ws <- wellsharp_period_stats()
    if (is.null(ws) || nrow(ws$cur) == 0) return("0")
    n_courses <- n_distinct(ws$cur$`Course Name`)
    span(n_courses, style = "font-size: 2.2rem; font-weight: 700;")
  })
  
  output$wellsharp_summary_participants <- renderUI({
    ws <- wellsharp_period_stats()
    if (is.null(ws) || nrow(ws$cur) == 0) return("0")
    span(format(nrow(ws$cur), big.mark = ","), style = "font-size: 2.2rem; font-weight: 700;")
  })
  
  output$wellsharp_summary_delta <- renderUI({
    ws <- wellsharp_period_stats()
    if (is.null(ws) || nrow(ws$cur) == 0 || nrow(ws$prev) == 0) return(NULL)
    diff <- nrow(ws$cur) - nrow(ws$prev)
    color <- if (diff >= 0) "success" else "danger"
    icon_name <- if (diff >= 0) "arrow-up" else "arrow-down"
    div(class = paste0("text-", color, " fw-bold small"),
        bs_icon(icon_name), paste(abs(diff), "vs prior"))
  })
  
  output$wellsharp_summary_vs_prior <- renderUI({
    ws <- wellsharp_period_stats()
    if (is.null(ws) || nrow(ws$prev) == 0) return("N/A")
    pct <- round((nrow(ws$cur) - nrow(ws$prev)) / nrow(ws$prev) * 100, 1)
    color <- if (pct >= 0) "success" else "danger"
    icon_name <- if (pct >= 0) "arrow-up" else "arrow-down"
    div(class = paste0("text-", color, " fw-bold"),
        bs_icon(icon_name), paste0(abs(pct), "%"))
  })
  
  output$wellsharp_summary_pct <- renderUI({
    ps <- period_stats()
    ws <- wellsharp_period_stats()
    if (is.null(ps) || is.null(ws) || nrow(ps$cur) == 0) return("0%")
    pct <- round(nrow(ws$cur) / nrow(ps$cur) * 100, 1)
    span(paste0(pct, "%"), style = "font-size: 2.2rem; font-weight: 700;")
  })
  
  # --- New Executive Summary Monthly Bar Chart ---
  output$exec_monthly_participants <- renderPlotly({
    d <- strategic_df()  # uses year_filter
    if (is.null(d) || nrow(d) == 0) return(NULL)
    
    monthly <- d %>%
      mutate(Month = floor_date(`Actual Date`, "month")) %>%
      group_by(Month) %>%
      summarize(Participants = n(), .groups = "drop") %>%
      mutate(MonthLabel = format(Month, "%b %Y"))
    
    plot_ly(monthly, x = ~MonthLabel, y = ~Participants, type = 'bar',
            marker = list(color = NEFT_NAVY),
            text = ~format(Participants, big.mark = ","), textposition = 'outside',
            hovertemplate = '<b>%{x}</b><br>Participants: %{y}<extra></extra>') %>%
      layout(xaxis = list(title = "", tickangle = -45),
             yaxis = list(title = "Participants"),
             margin = list(b = 100), showlegend = FALSE)
  })
  
  # --- Existing Executive Summary Charts (unchanged) ---
  output$dynamic_trend_area <- renderPlotly({
    d <- chart_df()
    if (is.null(d) || nrow(d) == 0) return(NULL)
    
    mode <- tolower(input$chart_granularity %||% "daily")
    
    agg <- d %>%
      mutate(Period = period_floor(`Actual Date`, mode)) %>%
      group_by(Period) %>%
      summarize(Participants = n(), .groups = "drop") %>%
      arrange(Period)
    
    x_title <- switch(mode,
                      "daily" = "Date",
                      "weekly" = "Week",
                      "monthly" = "Month",
                      "yearly" = "Year",
                      "Date")
    
    plot_ly(agg, x = ~Period, y = ~Participants, type = 'scatter', mode = 'lines+markers+text',
            line = list(color = NEFT_NAVY, width = 3),
            marker = list(size = 8, color = NEFT_NAVY),
            text = ~Participants,
            textposition = 'top center',
            textfont = list(size = 10, color = NEFT_NAVY, family = "Inter"),
            fill = 'tozeroy', fillcolor = 'rgba(0, 33, 71, 0.1)',
            hovertemplate = '<b>%{x}</b><br>Participants: %{y}<extra></extra>') %>%
      layout(xaxis = list(title = x_title),
             yaxis = list(title = "Participants",
                          range = c(0, max(agg$Participants, na.rm = TRUE) * 1.25)),
             margin = list(l = 60, r = 30, t = 40, b = 40), showlegend = FALSE)
  })
  
  output$dynamic_clients_bar <- renderPlotly({
    d <- chart_df()
    if (is.null(d) || nrow(d) == 0) return(NULL)
    
    agg <- d %>%
      group_by(Client) %>%
      summarize(Participants = n(), .groups = "drop") %>%
      arrange(Participants) %>%
      tail(10)
    
    plot_ly(agg, y = ~reorder(Client, Participants), x = ~Participants, type = 'bar',
            orientation = 'h', marker = list(color = NEFT_GOLD),
            text = ~format(Participants, big.mark = ","), 
            textposition = 'outside',
            textfont = list(size = 11, color = NEFT_NAVY, family = "Inter"),
            hovertemplate = '<b>%{y}</b><br>Participants: %{text}<extra></extra>') %>%
      layout(xaxis = list(title = "Participants",
                          range = c(0, max(agg$Participants, na.rm = TRUE) * 1.2)), 
             yaxis = list(title = "", tickfont = list(size = 10)),
             margin = list(l = 160, r = 80, t = 20, b = 40), showlegend = FALSE)
  })
  
  output$instructor_workload_chart <- renderPlotly({
    ps <- period_stats()
    if (is.null(ps) || nrow(ps$cur_df) == 0) return(NULL)
    
    workload <- ps$cur_df %>%
      group_by(Instructor = `Instructor Name`) %>%
      summarize(Sessions = n_distinct(`Actual Sessions`), 
                Participants = n(), .groups = "drop") %>%
      arrange(desc(Sessions)) %>%
      head(10)
    
    workload <- workload %>% arrange(Sessions)  # ascending for horizontal bar
    
    plot_ly(workload, y = ~reorder(Instructor, Sessions)) %>%
      add_bars(x = ~Sessions, name = "Sessions",
               marker = list(color = NEFT_NAVY),
               text = ~Sessions, textposition = "outside",
               textfont = list(size = 11, color = NEFT_NAVY, family = "Inter")) %>%
      add_bars(x = ~Participants, name = "Participants",
               marker = list(color = NEFT_GOLD),
               text = ~Participants, textposition = "outside",
               textfont = list(size = 11, color = NEFT_NAVY, family = "Inter")) %>%
      layout(barmode = "group",
             xaxis = list(title = "Count", tickfont = list(size = 10),
                          range = c(0, max(workload$Participants, na.rm = TRUE) * 1.25)),
             yaxis = list(title = "", tickfont = list(size = 10)),
             legend = list(orientation = "h", x = 0.3, y = 1.08, font = list(size = 11)),
             margin = list(l = 180, r = 80, t = 50, b = 40),
             showlegend = TRUE)
  })
  
  output$instructor_capacity_metrics <- renderUI({
    ps <- period_stats()
    if (is.null(ps) || nrow(ps$cur_df) == 0) return(NULL)
    
    total_instructors <- n_distinct(ps$cur_df$`Instructor Name`)
    total_sessions <- n_distinct(ps$cur_df$`Actual Sessions`)
    total_participants <- nrow(ps$cur_df)
    avg_sessions_per_instructor <- round(total_sessions / total_instructors, 1)
    avg_participants_per_instructor <- round(total_participants / total_instructors, 1)
    avg_class_size <- round(total_participants / total_sessions, 1)
    
    top_instructor <- ps$cur_df %>%
      group_by(`Instructor Name`) %>%
      summarize(Sessions = n_distinct(`Actual Sessions`), .groups = "drop") %>%
      arrange(desc(Sessions)) %>%
      slice(1)
    
    tagList(
      div(class = "row g-3",
          div(class = "col-6",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "display-6 fw-bold text-primary", total_instructors),
                      div(class = "small text-muted", "Active Instructors")
                  )
              )
          ),
          div(class = "col-6",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "display-6 fw-bold text-warning", avg_sessions_per_instructor),
                      div(class = "small text-muted", "Avg Sessions/Instructor")
                  )
              )
          ),
          div(class = "col-6",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "display-6 fw-bold text-success", avg_participants_per_instructor),
                      div(class = "small text-muted", "Avg Participants/Instructor")
                  )
              )
          ),
          div(class = "col-6",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "display-6 fw-bold text-info", avg_class_size),
                      div(class = "small text-muted", "Avg Class Size")
                  )
              )
          )
      ),
      div(class = "mt-3 p-3 bg-primary text-white rounded",
          div(class = "fw-bold", icon("trophy"), " Top Performer"),
          div(class = "mt-2", 
              strong(top_instructor$`Instructor Name`),
              " - ", top_instructor$Sessions, " sessions delivered"
          )
      )
    )
  })
  
  # === HSE TAB OUTPUTS ===
  
  # --- Summary Value Boxes ---
  output$hse_courses_count <- renderUI({
    d <- hse_df()
    if (is.null(d) || nrow(d) == 0) return("0")
    n_courses <- n_distinct(d$`Course Name`)
    span(n_courses, style = "font-size: 2rem; font-weight: 700;")
  })
  
  output$hse_participants_count <- renderUI({
    d <- hse_df()
    if (is.null(d) || nrow(d) == 0) return("0")
    span(format(nrow(d), big.mark = ","), style = "font-size: 2rem; font-weight: 700;")
  })
  
  output$hse_pass_rate <- renderUI({
    # Placeholder – replace with actual pass rate logic if you have that data
    span("Future Enhancement", style = "font-size: 2rem; font-weight: 700;")
  })
  
  output$hse_hours <- renderUI({
    d <- hse_with_hours()
    if (is.null(d) || nrow(d) == 0) return("0")
    total_hours <- sum(d$EstimatedHours, na.rm = TRUE)
    span("Future Enhancment", style = "font-size: 2rem; font-weight: 700;")
  })
  
  # --- HSE Clients ---
  hse_clients <- reactive({
    d <- hse_df()
    if (is.null(d) || nrow(d) == 0) return(NULL)
    d %>% group_by(Client) %>% summarize(Value = n(), .groups = "drop") %>% arrange(desc(Value))
  })
  
  output$hse_top10_clients <- renderPlotly({
    clients <- hse_clients()
    if (is.null(clients)) return(NULL)
    top <- clients %>% slice_max(Value, n = 10)
    plot_ly(top, y = ~reorder(Client, Value), x = ~Value, type = 'bar', orientation = 'h',
            marker = list(color = HSE_COLOR),
            text = ~format(Value, big.mark = ","), textposition = 'outside',
            hovertemplate = '<b>%{y}</b><br>Participants: %{x}<extra></extra>') %>%
      layout(xaxis = list(title = "Participants", range = c(0, max(top$Value)*1.2)),
             yaxis = list(title = ""), margin = list(l = 200))
  })
  
  output$hse_next10_clients <- renderPlotly({
    clients <- hse_clients()
    if (is.null(clients) || nrow(clients) <= 10) return(NULL)
    next10 <- clients %>% slice(11:20)
    if (nrow(next10) == 0) return(NULL)
    plot_ly(next10, y = ~reorder(Client, Value), x = ~Value, type = 'bar', orientation = 'h',
            marker = list(color = "#6c757d"),
            text = ~format(Value, big.mark = ","), textposition = 'outside',
            hovertemplate = '<b>%{y}</b><br>Participants: %{x}<extra></extra>') %>%
      layout(xaxis = list(title = "Participants", range = c(0, max(next10$Value)*1.2)),
             yaxis = list(title = ""), margin = list(l = 200))
  })
  
  # --- HSE Courses ---
  hse_courses <- reactive({
    d <- hse_df()
    if (is.null(d) || nrow(d) == 0) return(NULL)
    d %>% group_by(Course = `Course Name`) %>% summarize(Value = n(), .groups = "drop") %>% arrange(desc(Value))
  })
  
  output$hse_top10_courses <- renderPlotly({
    courses <- hse_courses()
    if (is.null(courses)) return(NULL)
    top <- courses %>% slice_max(Value, n = 10)
    plot_ly(top, y = ~reorder(Course, Value), x = ~Value, type = 'bar', orientation = 'h',
            marker = list(color = HSE_COLOR),
            text = ~format(Value, big.mark = ","), textposition = 'outside',
            hovertemplate = '<b>%{y}</b><br>Enrollments: %{x}<extra></extra>') %>%
      layout(xaxis = list(title = "Enrollments"), yaxis = list(title = ""), margin = list(l = 300))
  })
  
  output$hse_next10_courses <- renderPlotly({
    courses <- hse_courses()
    if (is.null(courses) || nrow(courses) <= 10) return(NULL)
    next10 <- courses %>% slice(11:20)
    if (nrow(next10) == 0) return(NULL)
    plot_ly(next10, y = ~reorder(Course, Value), x = ~Value, type = 'bar', orientation = 'h',
            marker = list(color = "#6c757d"),
            text = ~format(Value, big.mark = ","), textposition = 'outside',
            hovertemplate = '<b>%{y}</b><br>Enrollments: %{x}<extra></extra>') %>%
      layout(xaxis = list(title = "Enrollments"), yaxis = list(title = ""), margin = list(l = 300))
  })
  
  # --- HSE Instructors (by participants) ---
  hse_instructors <- reactive({
    d <- hse_df()
    if (is.null(d) || nrow(d) == 0) return(NULL)
    d %>% group_by(Instructor = `Instructor Name`) %>% summarize(Value = n(), .groups = "drop") %>% arrange(desc(Value))
  })
  
  output$hse_top10_instructors <- renderPlotly({
    instructors <- hse_instructors()
    if (is.null(instructors)) return(NULL)
    top <- instructors %>% slice_max(Value, n = 10)
    plot_ly(top, y = ~reorder(Instructor, Value), x = ~Value, type = 'bar', orientation = 'h',
            marker = list(color = HSE_COLOR),
            text = ~format(Value, big.mark = ","), textposition = 'outside',
            hovertemplate = '<b>%{y}</b><br>Participants: %{x}<extra></extra>') %>%
      layout(xaxis = list(title = "Participants"), yaxis = list(title = ""), margin = list(l = 200))
  })
  
  output$hse_next10_instructors <- renderPlotly({
    instructors <- hse_instructors()
    if (is.null(instructors) || nrow(instructors) <= 10) return(NULL)
    next10 <- instructors %>% slice(11:20)
    if (nrow(next10) == 0) return(NULL)
    plot_ly(next10, y = ~reorder(Instructor, Value), x = ~Value, type = 'bar', orientation = 'h',
            marker = list(color = "#6c757d"),
            text = ~format(Value, big.mark = ","), textposition = 'outside',
            hovertemplate = '<b>%{y}</b><br>Participants: %{x}<extra></extra>') %>%
      layout(xaxis = list(title = "Participants"), yaxis = list(title = ""), margin = list(l = 200))
  })
  
  # --- HSE Trends ---
  output$hse_trend_participants <- renderPlotly({
    d <- hse_df()
    if (is.null(d) || nrow(d) == 0) return(NULL)
    
    mode <- tolower(input$chart_granularity %||% "daily")
    agg <- d %>%
      mutate(Period = period_floor(`Actual Date`, mode)) %>%
      group_by(Period) %>%
      summarize(Participants = n(), .groups = "drop") %>%
      arrange(Period)
    
    plot_ly(agg, x = ~Period, y = ~Participants, type = 'scatter', mode = 'lines+markers',
            line = list(color = HSE_COLOR, width = 3),
            marker = list(size = 6, color = HSE_COLOR),
            hovertemplate = '<b>%{x}</b><br>Participants: %{y}<extra></extra>') %>%
      layout(xaxis = list(title = ""), yaxis = list(title = "Participants"), showlegend = FALSE)
  })
  
  output$hse_trend_sessions <- renderPlotly({
    d <- hse_df()
    if (is.null(d) || nrow(d) == 0) return(NULL)
    
    mode <- tolower(input$chart_granularity %||% "daily")
    agg <- d %>%
      mutate(Period = period_floor(`Actual Date`, mode)) %>%
      group_by(Period) %>%
      summarize(Sessions = n_distinct(`Actual Sessions`), .groups = "drop") %>%
      arrange(Period)
    
    plot_ly(agg, x = ~Period, y = ~Sessions, type = 'scatter', mode = 'lines+markers',
            line = list(color = NEFT_GOLD, width = 3),
            marker = list(size = 6, color = NEFT_GOLD),
            hovertemplate = '<b>%{x}</b><br>Sessions: %{y}<extra></extra>') %>%
      layout(xaxis = list(title = ""), yaxis = list(title = "Sessions"), showlegend = FALSE)
  })
  
  # ============================================================
  # YEAR-OVER-YEAR CHARTS (unchanged)
  # ============================================================
  output$yearly_participants_chart <- renderPlotly({
    data <- yearly_comparison_data()
    if (is.null(data) || nrow(data) == 0) return(NULL)
    
    plot_ly(data, x = ~factor(Year), y = ~Participants, type = 'bar',
            marker = list(color = NEFT_NAVY),
            text = ~format(Participants, big.mark = ","), textposition = 'outside',
            textfont = list(size = 14, color = NEFT_NAVY, family = "Inter"),
            hovertemplate = '<b>%{x}</b><br>Participants: %{text}<extra></extra>') %>%
      layout(xaxis = list(title = "Year"), 
             yaxis = list(title = "Participants", tickformat = ",",
                          range = c(0, max(data$Participants, na.rm = TRUE) * 1.2)),
             margin = list(l = 70, r = 50, t = 50, b = 50), showlegend = FALSE)
  })
  
  output$yearly_sessions_chart <- renderPlotly({
    data <- yearly_comparison_data() %>% filter(!is.na(Sessions))
    if (is.null(data) || nrow(data) == 0) return(NULL)
    
    plot_ly(data, x = ~factor(Year), y = ~Sessions, type = 'bar',
            marker = list(color = NEFT_GOLD),
            text = ~format(Sessions, big.mark = ","), textposition = 'outside',
            textfont = list(size = 14, color = NEFT_NAVY, family = "Inter"),
            hovertemplate = '<b>%{x}</b><br>Sessions: %{text}<extra></extra>') %>%
      layout(xaxis = list(title = "Year"), 
             yaxis = list(title = "Sessions", tickformat = ",",
                          range = c(0, max(data$Sessions, na.rm = TRUE) * 1.2)),
             margin = list(l = 70, r = 50, t = 50, b = 50), showlegend = FALSE)
  })
  
  output$monthly_participants_title <- renderText({ paste("Participants by Month -", input$year_filter) })
  output$monthly_sessions_title <- renderText({ paste("Sessions by Month -", input$year_filter) })
  
  output$monthly_sessions_note <- renderUI({
    if (input$year_filter == "2023") {
      p("Session data not available for 2023", class = "text-muted small fst-italic mb-2")
    }
  })
  
  output$monthly_participants_chart <- renderPlotly({
    data <- monthly_comparison_data()
    if (is.null(data) || nrow(data) == 0) return(NULL)
    
    data$MonthLabel <- factor(data$MonthLabel, levels = data$MonthLabel)
    
    plot_ly(data, x = ~MonthLabel, y = ~Participants, type = 'bar',
            marker = list(color = NEFT_NAVY),
            text = ~format(Participants, big.mark = ","), textposition = 'outside',
            textfont = list(size = 11, color = NEFT_NAVY, family = "Inter"),
            hovertemplate = '<b>%{x}</b><br>Participants: %{text}<extra></extra>') %>%
      layout(xaxis = list(title = "", tickangle = -45), 
             yaxis = list(title = "Participants", tickformat = ",",
                          range = c(0, max(data$Participants, na.rm = TRUE) * 1.2)),
             margin = list(l = 70, r = 50, t = 50, b = 110), showlegend = FALSE)
  })
  
  output$monthly_sessions_chart <- renderPlotly({
    data <- monthly_comparison_data() %>% filter(!is.na(Sessions))
    if (is.null(data) || nrow(data) == 0) {
      return(plot_ly() %>% add_annotations(text = "No session data available",
                                           xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                                           showarrow = FALSE, font = list(size = 16, color = "gray")))
    }
    
    data$MonthLabel <- factor(data$MonthLabel, levels = data$MonthLabel)
    
    plot_ly(data, x = ~MonthLabel, y = ~Sessions, type = 'bar',
            marker = list(color = NEFT_GOLD),
            text = ~format(Sessions, big.mark = ","), textposition = 'outside',
            textfont = list(size = 11, color = NEFT_NAVY, family = "Inter"),
            hovertemplate = '<b>%{x}</b><br>Sessions: %{text}<extra></extra>') %>%
      layout(xaxis = list(title = "", tickangle = -45),
             yaxis = list(title = "Sessions", tickformat = ",",
                          range = c(0, max(data$Sessions, na.rm = TRUE) * 1.2)),
             margin = list(l = 70, r = 50, t = 50, b = 110), showlegend = FALSE)
  })
  
  # ============================================================
  # WELLSHARP TAB - PERIOD-REACTIVE DATA & OUTPUTS (unchanged)
  # ============================================================
  
  # WellSharp Data filtered by selected year
  wellsharp_year_df <- reactive({
    d_ws <- wellsharp_data()
    if (is.null(d_ws)) return(NULL)
    selected_yr <- as.numeric(input$year_filter)
    d_ws %>% filter(year(`Actual Date`) == selected_yr)
  })
  
  # WellSharp Data filtered by date range (for weekly)
  wellsharp_daterange_df <- reactive({
    d_ws <- wellsharp_data()
    if (is.null(d_ws)) return(NULL)
    d_ws %>% filter(`Actual Date` >= input$date_picker[1] & `Actual Date` <= input$date_picker[2])
  })
  
  # Master reactive: returns WellSharp data based on sidebar Charts View
  ws_period_data <- reactive({
    mode <- tolower(input$chart_granularity %||% "daily")
    
    if (mode %in% c("daily", "weekly")) {
      return(wellsharp_daterange_df())
    } else if (mode == "monthly") {
      return(wellsharp_year_df())
    } else {
      return(wellsharp_data())
    }
  })
  
  # Period label for shared section
  output$ws_period_label <- renderText({
    mode <- tolower(input$chart_granularity %||% "daily")
    if (mode %in% c("daily", "weekly")) {
      paste0("WellSharp Analysis \u2014 ", format(input$date_picker[1], "%d %b"), " to ", format(input$date_picker[2], "%d %b %Y"))
    } else if (mode == "monthly") {
      paste0("WellSharp Analysis \u2014 ", input$year_filter)
    } else {
      "WellSharp Analysis \u2014 All Years"
    }
  })
  
  # Helper: compute WellSharp teaching hours per session
  ws_session_hours <- function(d_ws) {
    if (is.null(d_ws) || nrow(d_ws) == 0) return(NULL)
    d_ws %>%
      group_by(`Actual Date`, `Actual Sessions`, `Course Name`) %>%
      summarize(TotalHours = first(TotalHours), 
                Participants = n(), .groups = "drop")
  }
  
  # Dynamic title outputs for WellSharp period charts
  output$ws_period_hours_title <- renderText({
    mode <- tolower(input$chart_granularity %||% "daily")
    lbl <- switch(mode, "daily" = "Daily", "weekly" = "Weekly", 
                  "monthly" = paste("Monthly -", input$year_filter), 
                  "yearly" = "Yearly", "Daily")
    paste("WellSharp", lbl, "Teaching Hours")
  })
  
  output$ws_period_sessions_title <- renderText({
    mode <- tolower(input$chart_granularity %||% "daily")
    lbl <- switch(mode, "daily" = "Daily", "weekly" = "Weekly", 
                  "monthly" = paste("Monthly -", input$year_filter), 
                  "yearly" = "Yearly", "Daily")
    paste("WellSharp", lbl, "Sessions & Participants")
  })
  
  # Unified WellSharp Teaching Hours Chart
  output$ws_period_hours_chart <- renderPlotly({
    mode <- tolower(input$chart_granularity %||% "daily")
    
    # Select appropriate data source
    d_ws <- if (mode %in% c("daily", "weekly")) wellsharp_daterange_df()
    else if (mode == "monthly") wellsharp_year_df()
    else wellsharp_data()
    
    if (is.null(d_ws) || nrow(d_ws) == 0) {
      return(plot_ly() %>% add_annotations(text = "No WellSharp data for selected period",
                                           xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                                           showarrow = FALSE, font = list(size = 14, color = "gray")))
    }
    
    sess <- ws_session_hours(d_ws)
    
    if (mode == "daily") {
      agg <- sess %>%
        group_by(Period = `Actual Date`) %>%
        summarize(Hours = sum(TotalHours, na.rm = TRUE), .groups = "drop") %>%
        arrange(Period)
      
      plot_ly(agg, x = ~Period, y = ~Hours, type = 'scatter', mode = 'lines+markers',
              line = list(color = NEFT_NAVY, width = 3),
              marker = list(size = 8, color = NEFT_NAVY),
              text = ~paste0(Hours, "h"), textposition = 'top center',
              textfont = list(size = 10, color = NEFT_NAVY, family = "Inter"),
              hovertemplate = '<b>%{x}</b><br>Teaching Hours: %{y}<extra></extra>') %>%
        layout(xaxis = list(title = ""),
               yaxis = list(title = "Teaching Hours",
                            range = c(0, max(agg$Hours, na.rm = TRUE) * 1.25)),
               showlegend = FALSE)
      
    } else if (mode == "weekly") {
      agg <- sess %>%
        mutate(Week = floor_date(`Actual Date`, "week", week_start = 5)) %>%
        group_by(Week) %>%
        summarize(Hours = sum(TotalHours, na.rm = TRUE), .groups = "drop") %>%
        arrange(Week) %>%
        mutate(WeekLabel = paste0(format(Week, "%d %b"), " - ", format(Week + 6, "%d %b")))
      agg$WeekLabel <- factor(agg$WeekLabel, levels = agg$WeekLabel)
      
      plot_ly(agg, x = ~WeekLabel, y = ~Hours, type = 'bar',
              marker = list(color = NEFT_NAVY),
              text = ~paste0(format(Hours, big.mark = ","), "h"), textposition = 'outside',
              textfont = list(size = 11, color = NEFT_NAVY, family = "Inter"),
              hovertemplate = '<b>%{x}</b><br>Teaching Hours: %{y}<extra></extra>') %>%
        layout(xaxis = list(title = "", tickangle = -45, tickfont = list(size = 10)),
               yaxis = list(title = "Teaching Hours",
                            range = c(0, max(agg$Hours, na.rm = TRUE) * 1.25)),
               margin = list(l = 70, r = 60, t = 40, b = 120), showlegend = FALSE)
      
    } else if (mode == "monthly") {
      agg <- sess %>%
        mutate(Month = floor_date(`Actual Date`, "month")) %>%
        group_by(Month) %>%
        summarize(Hours = sum(TotalHours, na.rm = TRUE), .groups = "drop") %>%
        arrange(Month) %>%
        mutate(MonthLabel = format(Month, "%b %Y"))
      agg$MonthLabel <- factor(agg$MonthLabel, levels = agg$MonthLabel)
      
      plot_ly(agg, x = ~MonthLabel, y = ~Hours, type = 'bar',
              marker = list(color = NEFT_NAVY),
              text = ~paste0(format(Hours, big.mark = ","), "h"), textposition = 'outside',
              textfont = list(size = 11, color = NEFT_NAVY, family = "Inter"),
              hovertemplate = '<b>%{x}</b><br>Teaching Hours: %{y}<extra></extra>') %>%
        layout(xaxis = list(title = "", tickangle = -45, tickfont = list(size = 10)),
               yaxis = list(title = "Teaching Hours",
                            range = c(0, max(agg$Hours, na.rm = TRUE) * 1.25)),
               margin = list(l = 70, r = 60, t = 40, b = 110), showlegend = FALSE)
      
    } else {
      agg <- sess %>%
        mutate(Year = year(`Actual Date`)) %>%
        group_by(Year) %>%
        summarize(Hours = sum(TotalHours, na.rm = TRUE), .groups = "drop") %>%
        arrange(Year)
      
      plot_ly(agg, x = ~factor(Year), y = ~Hours, type = 'bar',
              marker = list(color = NEFT_NAVY),
              text = ~paste0(format(Hours, big.mark = ","), "h"), textposition = 'outside',
              textfont = list(size = 13, color = NEFT_NAVY, family = "Inter"),
              hovertemplate = '<b>%{x}</b><br>Teaching Hours: %{y}<extra></extra>') %>%
        layout(xaxis = list(title = "Year", tickfont = list(size = 12)),
               yaxis = list(title = "Teaching Hours",
                            range = c(0, max(agg$Hours, na.rm = TRUE) * 1.25)),
               margin = list(l = 70, r = 60, t = 50, b = 50), showlegend = FALSE)
    }
  })
  
  # Unified WellSharp Sessions & Participants Chart
  output$ws_period_sessions_chart <- renderPlotly({
    mode <- tolower(input$chart_granularity %||% "daily")
    
    d_ws <- if (mode %in% c("daily", "weekly")) wellsharp_daterange_df()
    else if (mode == "monthly") wellsharp_year_df()
    else wellsharp_data()
    
    if (is.null(d_ws) || nrow(d_ws) == 0) {
      return(plot_ly() %>% add_annotations(text = "No WellSharp data for selected period",
                                           xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                                           showarrow = FALSE, font = list(size = 14, color = "gray")))
    }
    
    if (mode == "daily") {
      agg <- d_ws %>%
        group_by(Period = `Actual Date`) %>%
        summarize(Sessions = n_distinct(`Actual Sessions`),
                  Participants = n(), .groups = "drop") %>%
        arrange(Period)
      
      plot_ly(agg, x = ~Period) %>%
        add_trace(y = ~Sessions, name = "Sessions", type = 'scatter', mode = 'lines+markers',
                  line = list(color = NEFT_NAVY, width = 3),
                  marker = list(size = 7, color = NEFT_NAVY)) %>%
        add_trace(y = ~Participants, name = "Participants", type = 'scatter', mode = 'lines+markers',
                  line = list(color = NEFT_GOLD, width = 3),
                  marker = list(size = 7, color = NEFT_GOLD)) %>%
        layout(xaxis = list(title = ""),
               yaxis = list(title = "Count",
                            range = c(0, max(agg$Participants, na.rm = TRUE) * 1.25)),
               legend = list(orientation = "h", x = 0.25, y = 1.08, font = list(size = 11)),
               showlegend = TRUE)
      
    } else if (mode == "weekly") {
      agg <- d_ws %>%
        mutate(Week = floor_date(`Actual Date`, "week", week_start = 5)) %>%
        group_by(Week) %>%
        summarize(Sessions = n_distinct(`Actual Sessions`),
                  Participants = n(), .groups = "drop") %>%
        arrange(Week) %>%
        mutate(WeekLabel = paste0(format(Week, "%d %b"), " - ", format(Week + 6, "%d %b")))
      agg$WeekLabel <- factor(agg$WeekLabel, levels = agg$WeekLabel)
      
      plot_ly(agg, x = ~WeekLabel) %>%
        add_bars(y = ~Sessions, name = "Sessions",
                 marker = list(color = NEFT_NAVY),
                 text = ~Sessions, textposition = "outside",
                 textfont = list(size = 10, color = NEFT_NAVY, family = "Inter")) %>%
        add_bars(y = ~Participants, name = "Participants",
                 marker = list(color = NEFT_GOLD),
                 text = ~Participants, textposition = "outside",
                 textfont = list(size = 10, color = NEFT_NAVY, family = "Inter")) %>%
        layout(barmode = "group",
               xaxis = list(title = "", tickangle = -45, tickfont = list(size = 10)),
               yaxis = list(title = "Count",
                            range = c(0, max(agg$Participants, na.rm = TRUE) * 1.25)),
               legend = list(orientation = "h", x = 0.25, y = 1.08, font = list(size = 11)),
               margin = list(l = 70, r = 60, t = 50, b = 120), showlegend = TRUE)
      
    } else if (mode == "monthly") {
      agg <- d_ws %>%
        mutate(Month = floor_date(`Actual Date`, "month")) %>%
        group_by(Month) %>%
        summarize(Sessions = n_distinct(`Actual Sessions`),
                  Participants = n(), .groups = "drop") %>%
        arrange(Month) %>%
        mutate(MonthLabel = format(Month, "%b %Y"))
      agg$MonthLabel <- factor(agg$MonthLabel, levels = agg$MonthLabel)
      
      plot_ly(agg, x = ~MonthLabel) %>%
        add_bars(y = ~Sessions, name = "Sessions",
                 marker = list(color = NEFT_NAVY),
                 text = ~Sessions, textposition = "outside",
                 textfont = list(size = 10, color = NEFT_NAVY, family = "Inter")) %>%
        add_bars(y = ~Participants, name = "Participants",
                 marker = list(color = NEFT_GOLD),
                 text = ~Participants, textposition = "outside",
                 textfont = list(size = 10, color = NEFT_NAVY, family = "Inter")) %>%
        layout(barmode = "group",
               xaxis = list(title = "", tickangle = -45, tickfont = list(size = 10)),
               yaxis = list(title = "Count",
                            range = c(0, max(agg$Participants, na.rm = TRUE) * 1.25)),
               legend = list(orientation = "h", x = 0.25, y = 1.08, font = list(size = 11)),
               margin = list(l = 70, r = 60, t = 50, b = 110), showlegend = TRUE)
      
    } else {
      agg <- d_ws %>%
        mutate(Year = year(`Actual Date`)) %>%
        group_by(Year) %>%
        summarize(Sessions = n_distinct(`Actual Sessions`),
                  Participants = n(), .groups = "drop") %>%
        arrange(Year)
      
      plot_ly(agg, x = ~factor(Year)) %>%
        add_bars(y = ~Sessions, name = "Sessions",
                 marker = list(color = NEFT_NAVY),
                 text = ~Sessions, textposition = "outside",
                 textfont = list(size = 12, color = NEFT_NAVY, family = "Inter")) %>%
        add_bars(y = ~Participants, name = "Participants",
                 marker = list(color = NEFT_GOLD),
                 text = ~format(Participants, big.mark = ","), textposition = "outside",
                 textfont = list(size = 12, color = NEFT_NAVY, family = "Inter")) %>%
        layout(barmode = "group",
               xaxis = list(title = "Year", tickfont = list(size = 12)),
               yaxis = list(title = "Count",
                            range = c(0, max(agg$Participants, na.rm = TRUE) * 1.25)),
               legend = list(orientation = "h", x = 0.25, y = 1.08, font = list(size = 11)),
               margin = list(l = 70, r = 60, t = 50, b = 50), showlegend = TRUE)
    }
  })
  
  # ============================================================
  # WELLSHARP - SHARED CHARTS (unchanged)
  # ============================================================
  
  # Reference Table
  output$wellsharp_ref_table <- DT::renderDataTable({
    display_df <- wellsharp_hours %>%
      select(`Course Name` = CourseName, Days, `Hours/Day` = HoursPerDay, `Total Hours` = TotalHours)
    DT::datatable(display_df, 
                  options = list(pageLength = 7, dom = 't', scrollX = TRUE,
                                 columnDefs = list(list(className = 'dt-center', targets = 1:3))),
                  rownames = FALSE, class = 'stripe hover compact')
  })
  
  # Top 6 WellSharp Instructors by Teaching Hours
  output$wellsharp_top_instructors_chart <- renderPlotly({
    d_ws <- ws_period_data()
    if (is.null(d_ws) || nrow(d_ws) == 0) {
      return(plot_ly() %>% add_annotations(text = "No WellSharp course data found",
                                           xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                                           showarrow = FALSE, font = list(size = 16, color = "gray")))
    }
    
    # Calculate teaching hours: each unique session for a course = TotalHours for that course
    instructor_hours <- d_ws %>%
      group_by(`Instructor Name`, `Course Name`, `Actual Sessions`) %>%
      summarize(TotalHours = first(TotalHours), .groups = "drop") %>%
      group_by(`Instructor Name`) %>%
      summarize(TeachingHours = sum(TotalHours, na.rm = TRUE),
                SessionsCount = n(), .groups = "drop") %>%
      arrange(desc(TeachingHours)) %>%
      head(6)
    
    instructor_hours <- instructor_hours %>% arrange(TeachingHours)
    
    plot_ly(instructor_hours, 
            y = ~reorder(`Instructor Name`, TeachingHours), 
            x = ~TeachingHours, 
            type = 'bar', orientation = 'h',
            marker = list(color = NEFT_NAVY,
                          line = list(color = NEFT_GOLD, width = 2)),
            text = ~paste0(format(TeachingHours, big.mark = ","), " hrs (", SessionsCount, " sessions)"),
            textposition = 'outside',
            textfont = list(size = 12, color = NEFT_NAVY, family = "Inter"),
            hovertemplate = '<b>%{y}</b><br>Teaching Hours: %{x}<br><extra></extra>') %>%
      layout(xaxis = list(title = "Teaching Hours", tickfont = list(size = 11),
                          range = c(0, max(instructor_hours$TeachingHours, na.rm = TRUE) * 1.35)),
             yaxis = list(title = "", tickfont = list(size = 12)),
             margin = list(l = 200, r = 140, t = 30, b = 50),
             showlegend = FALSE)
  })
  
  # WellSharp Summary Metrics
  output$wellsharp_summary_metrics <- renderUI({
    d_ws <- ws_period_data()
    if (is.null(d_ws) || nrow(d_ws) == 0) {
      return(div(class = "text-center text-muted mt-5", 
                 icon("exclamation-triangle", class = "fa-3x mb-3"),
                 h5("No WellSharp data found")))
    }
    
    total_participants <- nrow(d_ws)
    total_instructors <- n_distinct(d_ws$`Instructor Name`)
    total_sessions <- n_distinct(d_ws$`Actual Sessions`)
    total_courses <- n_distinct(d_ws$`Course Name`)
    
    # Total teaching hours
    session_hours <- d_ws %>%
      group_by(`Actual Sessions`, `Course Name`) %>%
      summarize(TotalHours = first(TotalHours), .groups = "drop")
    total_hours <- sum(session_hours$TotalHours, na.rm = TRUE)
    
    # Most taught course
    top_course <- d_ws %>%
      count(`Course Name`, sort = TRUE) %>%
      slice(1)
    
    # Count retakes
    retake_count <- d_ws %>%
      filter(str_detect(`Course Name`, regex("\\(Retake Exam\\)", ignore_case = TRUE))) %>%
      nrow()
    
    tagList(
      div(class = "row g-3 mb-3",
          div(class = "col-6",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "display-6 fw-bold text-primary", format(total_participants, big.mark = ",")),
                      div(class = "small text-muted", "Total Participants"),
                      div(class = "small text-muted fst-italic", "(incl. retakes)")
                  )
              )
          ),
          div(class = "col-6",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "display-6 fw-bold text-warning", total_instructors),
                      div(class = "small text-muted", "Instructors")
                  )
              )
          ),
          div(class = "col-6",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "display-6 fw-bold text-success", format(total_sessions, big.mark = ",")),
                      div(class = "small text-muted", "Total Sessions")
                  )
              )
          ),
          div(class = "col-6",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "display-6 fw-bold text-info", format(total_hours, big.mark = ",")),
                      div(class = "small text-muted", "Total Teaching Hours")
                  )
              )
          )
      ),
      div(class = "row g-3 mb-3",
          div(class = "col-4",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "h4 fw-bold text-primary mb-0", total_courses),
                      div(class = "small text-muted", "Active Courses")
                  )
              )
          ),
          div(class = "col-4",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "h4 fw-bold text-danger mb-0", retake_count),
                      div(class = "small text-muted", "Course Retakes")
                  )
              )
          ),
          div(class = "col-4",
              div(class = "card bg-light border-0 h-100",
                  div(class = "card-body text-center p-3",
                      div(class = "h4 fw-bold text-secondary mb-0", 
                          if(total_sessions > 0) round(total_participants / total_sessions, 1) else 0),
                      div(class = "small text-muted", "Avg Class Size")
                  )
              )
          )
      ),
      div(class = "p-3 bg-primary text-white rounded",
          div(class = "fw-bold", icon("star"), " Most Taught Course"),
          div(class = "mt-2 small",
              strong(top_course$`Course Name`),
              " — ", format(top_course$n, big.mark = ","), " participants"
          )
      )
    )
  })
  
  # WellSharp Course Breakdown by Instructor (stacked bar)
  output$wellsharp_course_breakdown_chart <- renderPlotly({
    d_ws <- ws_period_data()
    if (is.null(d_ws) || nrow(d_ws) == 0) return(NULL)
    
    # Get top 6 instructors by hours
    top6 <- d_ws %>%
      group_by(`Instructor Name`, `Actual Sessions`, `Course Name`) %>%
      summarize(TotalHours = first(TotalHours), .groups = "drop") %>%
      group_by(`Instructor Name`) %>%
      summarize(TeachingHours = sum(TotalHours, na.rm = TRUE), .groups = "drop") %>%
      arrange(desc(TeachingHours)) %>%
      head(6) %>% pull(`Instructor Name`)
    
    breakdown <- d_ws %>%
      filter(`Instructor Name` %in% top6) %>%
      group_by(`Instructor Name`, `Actual Sessions`, `Course Name`) %>%
      summarize(TotalHours = first(TotalHours), .groups = "drop") %>%
      group_by(`Instructor Name`, `Course Name`) %>%
      summarize(Hours = sum(TotalHours, na.rm = TRUE), Sessions = n(), .groups = "drop")
    
    # Shorten course names for display
    breakdown <- breakdown %>%
      mutate(ShortCourse = gsub("IADC - WELLSHARP ", "", `Course Name`))
    
    plot_ly(breakdown, y = ~`Instructor Name`, x = ~Hours, color = ~ShortCourse,
            type = 'bar', orientation = 'h',
            text = ~paste0(Hours, "h"), textposition = 'inside',
            textfont = list(size = 10, color = "white", family = "Inter"),
            hovertemplate = '<b>%{y}</b><br>Course: %{data.name}<br>Hours: %{x}<extra></extra>') %>%
      layout(barmode = 'stack',
             xaxis = list(title = "Teaching Hours", tickfont = list(size = 11)),
             yaxis = list(title = "", tickfont = list(size = 11)),
             legend = list(orientation = "h", y = -0.2, font = list(size = 9)),
             margin = list(l = 200, r = 50, t = 30, b = 120),
             showlegend = TRUE)
  })
  
  # WellSharp Retake Analysis Chart
  output$wellsharp_retake_chart <- renderPlotly({
    d_ws <- ws_period_data()
    if (is.null(d_ws) || nrow(d_ws) == 0) {
      return(plot_ly() %>% add_annotations(text = "No WellSharp data found",
                                           xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                                           showarrow = FALSE, font = list(size = 14, color = "gray")))
    }
    
    # A retake = participant took retake exams
    retakes_by_course <- d_ws %>%
      filter(str_detect(`Course Name`, regex("\\(Retake Exam\\)", ignore_case = TRUE))) %>%
      group_by(`Course Name`) %>%
      summarize(Retakes = n(), .groups = "drop") %>%
      mutate(ShortCourse = gsub("(?i)IADC - WELLSHARP |\\s*\\(Retake Exam\\)", 
                                "", `Course Name`, perl = TRUE)) %>%
      arrange(Retakes)
    
    if (nrow(retakes_by_course) == 0) {
      return(plot_ly() %>% add_annotations(text = "No retakes found in selected period",
                                           xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                                           showarrow = FALSE, font = list(size = 14, color = "gray")))
    }
    
    retakes_by_course <- retakes_by_course %>%
      mutate(ShortCourse = gsub("IADC - WELLSHARP ", "", `Course Name`))
    
    plot_ly(retakes_by_course, 
            y = ~reorder(ShortCourse, Retakes), x = ~Retakes,
            type = 'bar', orientation = 'h',
            marker = list(color = "#d32f2f"),
            text = ~Retakes, textposition = 'outside',
            textfont = list(size = 12, color = "#d32f2f", family = "Inter"),
            hovertemplate = '<b>%{y}</b><br>Retakes: %{x}<extra></extra>') %>%
      layout(xaxis = list(title = "Number of Retakes", tickfont = list(size = 10),
                          range = c(0, max(retakes_by_course$Retakes, na.rm = TRUE) * 1.3)),
             yaxis = list(title = "", tickfont = list(size = 10)),
             margin = list(l = 220, r = 80, t = 20, b = 40),
             showlegend = FALSE)
  })
  
  # Retake Detail Table
  output$wellsharp_retake_table <- DT::renderDataTable({
    d_ws <- ws_period_data()
    if (is.null(d_ws) || nrow(d_ws) == 0) {
      return(DT::datatable(data.frame(Message = "No data"), options = list(dom = 't')))
    }
    
    retake_detail <- d_ws %>%
      filter(str_detect(`Course Name`, regex("\\(Retake Exam\\)", ignore_case = TRUE))) %>%
      group_by(Participant = `Participant's Name`, Course = `Course Name`) %>%
      summarize(`Retake Sessions` = n_distinct(`Actual Sessions`), .groups = "drop") %>%
      arrange(desc(`Retake Sessions`))
    
    if (nrow(retake_detail) == 0) {
      return(DT::datatable(data.frame(Message = "No retakes found in selected period"), options = list(dom = 't')))
    }
    
    DT::datatable(retake_detail, 
                  options = list(pageLength = 5, scrollX = TRUE, dom = 'tp'),
                  rownames = FALSE, class = 'stripe hover compact')
  })
  
  # WellSharp Top 5 Clients Chart
  output$wellsharp_top5_clients_chart <- renderPlotly({
    d_ws <- ws_period_data()
    if (is.null(d_ws) || nrow(d_ws) == 0) {
      return(plot_ly() %>% add_annotations(text = "No WellSharp data found",
                                           xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                                           showarrow = FALSE, font = list(size = 14, color = "gray")))
    }
    
    # Group by Client and count participants (includes retakes)
    client_stats <- d_ws %>%
      group_by(Client) %>%
      summarize(
        Participants = n(),
        Sessions = n_distinct(`Actual Sessions`),
        Retakes = sum(str_detect(`Course Name`, regex("\\(Retake Exam\\)", ignore_case = TRUE))),
        .groups = "drop"
      ) %>%
      arrange(desc(Participants)) %>%
      head(5)
    
    if (nrow(client_stats) == 0) {
      return(plot_ly() %>% add_annotations(text = "No client data found",
                                           xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                                           showarrow = FALSE, font = list(size = 14, color = "gray")))
    }
    
    # Reorder for horizontal bar (bottom to top)
    client_stats <- client_stats %>% arrange(Participants)
    
    plot_ly(client_stats, 
            y = ~reorder(Client, Participants), 
            x = ~Participants, 
            type = 'bar', orientation = 'h',
            marker = list(color = NEFT_NAVY,
                          line = list(color = NEFT_GOLD, width = 1.5)),
            text = ~paste0(format(Participants, big.mark = ","), " participants (", 
                           Sessions, " sessions, ", Retakes, " retakes)"),
            textposition = 'outside',
            textfont = list(size = 11, color = NEFT_NAVY, family = "Inter"),
            hovertemplate = '<b>%{y}</b><br>Participants: %{x}<br>Sessions: %{customdata[0]}<br>Retakes: %{customdata[1]}<extra></extra>',
            customdata = ~cbind(Sessions, Retakes)) %>%
      layout(xaxis = list(title = "Number of Participants", tickfont = list(size = 11),
                          range = c(0, max(client_stats$Participants, na.rm = TRUE) * 1.4)),
             yaxis = list(title = "", tickfont = list(size = 11)),
             margin = list(l = 250, r = 180, t = 30, b = 50),
             showlegend = FALSE)
  })
  
  # WellSharp Detail Table
  output$wellsharp_detail_table <- DT::renderDataTable({
    d_ws <- ws_period_data()
    if (is.null(d_ws) || nrow(d_ws) == 0) {
      return(DT::datatable(data.frame(Message = "No WellSharp data found"),
                           options = list(dom = 't')))
    }
    
    detail <- d_ws %>%
      group_by(`Instructor Name`, `Course Name`, `Actual Sessions`) %>%
      summarize(TotalHours = first(TotalHours), Participants = n(), .groups = "drop") %>%
      group_by(`Instructor Name`, `Course Name`) %>%
      summarize(Sessions = n(),
                `Teaching Hours` = sum(TotalHours, na.rm = TRUE),
                `Total Participants` = sum(Participants), .groups = "drop") %>%
      arrange(desc(`Teaching Hours`))
    
    DT::datatable(detail, 
                  options = list(pageLength = 15, scrollX = TRUE),
                  rownames = FALSE, class = 'stripe hover')
  })
  
  # WellSharp Instructors vs No. of Participants Chart
  output$wellsharp_instructor_participants_chart <- renderPlotly({
    d_ws <- ws_period_data()
    if (is.null(d_ws) || nrow(d_ws) == 0) {
      return(plot_ly() %>% add_annotations(text = "No WellSharp data found",
                                           xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                                           showarrow = FALSE, font = list(size = 14, color = "gray")))
    }
    
    instr_part <- d_ws %>%
      group_by(`Instructor Name`) %>%
      summarize(Participants = n(), 
                Sessions = n_distinct(`Actual Sessions`), .groups = "drop") %>%
      arrange(Participants)
    
    plot_ly(instr_part, 
            y = ~reorder(`Instructor Name`, Participants), 
            x = ~Participants, 
            type = 'bar', orientation = 'h',
            marker = list(color = NEFT_NAVY,
                          line = list(color = NEFT_GOLD, width = 1.5)),
            text = ~paste0(format(Participants, big.mark = ","), " participants (", Sessions, " sessions)"),
            textposition = 'outside',
            textfont = list(size = 11, color = NEFT_NAVY, family = "Inter"),
            hovertemplate = '<b>%{y}</b><br>Participants: %{x}<br><extra></extra>') %>%
      layout(xaxis = list(title = "Number of Participants", tickfont = list(size = 11),
                          range = c(0, max(instr_part$Participants, na.rm = TRUE) * 1.4)),
             yaxis = list(title = "", tickfont = list(size = 11)),
             margin = list(l = 200, r = 160, t = 30, b = 50),
             showlegend = FALSE)
  })
  
  # ============================================================
  # QIDDIYA ACADEMY + TAKAMOL  (new - nothing above is modified)
  # ============================================================
  
  qd_empty_plot <- function(msg = "No data available") {
    plot_ly() %>%
      add_annotations(text = msg, xref = "paper", yref = "paper",
                      x = 0.5, y = 0.5, showarrow = FALSE,
                      font = list(size = 15, color = "gray"))
  }
  
  fmt_int <- function(x) format(round(as.numeric(x %||% 0)), big.mark = ",", scientific = FALSE)
  
  big_num <- function(x) span(fmt_int(x), style = "font-size: 2.2rem; font-weight: 700;")
  
  # ---- Workbook store -------------------------------------------------
  qiddiya_store <- reactiveVal(tryCatch(load_qiddiya_all(), error = function(e) NULL))
  
  observeEvent(input$qd_reload, {
    qiddiya_store(tryCatch(load_qiddiya_all(), error = function(e) NULL))
    st <- qiddiya_store()
    if (is.null(st)) {
      showNotification("No Qiddiya workbook found. Put the QCTA .xlsx file next to app.R.",
                       type = "warning", duration = 6)
    } else {
      showNotification(paste0("Loaded ", length(st$files), " Qiddiya workbook file(s)."),
                       type = "message", duration = 4)
    }
  })
  
  qd_sessions_all <- reactive({ st <- qiddiya_store(); if (is.null(st)) NULL else st$sessions })
  qd_days_all     <- reactive({ st <- qiddiya_store(); if (is.null(st)) NULL else st$days })
  
  output$qd_files_note <- renderUI({
    st <- qiddiya_store()
    if (is.null(st) || !length(st$files))
      return(span(class = "text-danger", "No QCTA workbook detected."))
    tagList(
      span(paste0(length(st$files), " file(s) loaded: ")),
      span(paste(st$files, collapse = ", "))
    )
  })
  
  # ---- Manual entry stores -------------------------------------------
  qd_manual <- reactiveVal(read_manual_entries(QIDDIYA_MANUAL_FILE))
  tk_manual <- reactiveVal(read_manual_entries(TAKAMOL_MANUAL_FILE))
  
  add_manual_row <- function(store, path, prefix, yr, mo, part, sess, tdays, note) {
    yr <- suppressWarnings(as.numeric(yr))
    mo <- suppressWarnings(as.numeric(mo))
    if (is.na(yr) || is.na(mo) || mo < 1 || mo > 12) {
      showNotification("Please choose a valid year and month.", type = "error")
      return(invisible(FALSE))
    }
    num <- function(v) { v <- suppressWarnings(as.numeric(v)); if (is.na(v) || v < 0) 0 else v }
    part <- num(part); sess <- num(sess); tdays <- num(tdays)
    if (part == 0 && sess == 0 && tdays == 0) {
      showNotification("Nothing to save - enter at least one number greater than zero.",
                       type = "warning")
      return(invisible(FALSE))
    }
    key <- paste0(prefix, "-", sprintf("%04d-%02d", as.integer(yr), as.integer(mo)))
    new_row <- tibble(
      ID = key, Year = yr, Month = mo,
      Participants = part, Sessions = sess, TeachingDays = tdays,
      Note = as.character(note %||% ""),
      AddedOn = format(Sys.time(), "%Y-%m-%d %H:%M")
    )
    updated <- store() %>% filter(ID != key) %>% bind_rows(new_row) %>% arrange(Year, Month)
    store(updated)
    ok <- write_manual_entries(updated, path)
    showNotification(
      if (ok) paste0("Saved ", format(as.Date(sprintf("%04d-%02d-01", as.integer(yr), as.integer(mo))), "%B %Y"), ".")
      else "Saved for this session only - the CSV file could not be written (check folder permissions).",
      type = if (ok) "message" else "warning", duration = 4)
    invisible(TRUE)
  }
  
  delete_manual_rows <- function(store, path, rows) {
    cur <- store()
    if (is.null(rows) || !length(rows) || nrow(cur) == 0) {
      showNotification("Select at least one row in the table first.", type = "warning")
      return(invisible(FALSE))
    }
    rows <- rows[rows >= 1 & rows <= nrow(cur)]
    if (!length(rows)) return(invisible(FALSE))
    updated <- cur[-rows, , drop = FALSE]
    store(updated)
    write_manual_entries(updated, path)
    showNotification(paste0("Removed ", length(rows), " row(s)."), type = "message", duration = 3)
    invisible(TRUE)
  }
  
  observeEvent(input$qd_m_add, {
    add_manual_row(qd_manual, QIDDIYA_MANUAL_FILE, "QD",
                   input$qd_m_year, input$qd_m_month,
                   input$qd_m_participants, input$qd_m_sessions, input$qd_m_days,
                   input$qd_m_note)
  })
  
  observeEvent(input$qd_m_delete, {
    delete_manual_rows(qd_manual, QIDDIYA_MANUAL_FILE, input$qd_manual_table_rows_selected)
  })
  
  observeEvent(input$tk_m_add, {
    add_manual_row(tk_manual, TAKAMOL_MANUAL_FILE, "TK",
                   input$tk_m_year, input$tk_m_month,
                   input$tk_m_participants, input$tk_m_sessions, 0,
                   input$tk_m_note)
  })
  
  observeEvent(input$tk_m_delete, {
    delete_manual_rows(tk_manual, TAKAMOL_MANUAL_FILE, input$tk_manual_table_rows_selected)
  })
  
  manual_display <- function(df, show_days = TRUE) {
    d <- manual_with_dates(df)
    if (nrow(d) == 0) {
      out <- tibble(Period = character(), Participants = numeric(),
                    Sessions = numeric(), `Teaching Days` = numeric(),
                    Note = character(), `Added On` = character())
      if (!show_days) out[["Teaching Days"]] <- NULL
      return(out)
    }
    out <- d %>%
      arrange(Year, Month) %>%
      transmute(Period = PeriodLabel,
                Participants, Sessions, `Teaching Days` = TeachingDays,
                Note = ifelse(is.na(Note), "", Note),
                `Added On` = ifelse(is.na(AddedOn), "", AddedOn))
    if (!show_days) out[["Teaching Days"]] <- NULL
    out
  }
  
  output$qd_manual_table <- DT::renderDataTable({
    DT::datatable(manual_display(qd_manual(), TRUE),
                  selection = "multiple", rownames = FALSE,
                  options = list(pageLength = 5, dom = "tp", scrollX = TRUE),
                  class = "stripe hover compact")
  })
  
  output$tk_manual_table <- DT::renderDataTable({
    DT::datatable(manual_display(tk_manual(), FALSE),
                  selection = "multiple", rownames = FALSE,
                  options = list(pageLength = 5, dom = "tp", scrollX = TRUE),
                  class = "stripe hover compact")
  })
  
  # ---- Period selector on the Qiddiya tab -----------------------------
  observe({
    s   <- qd_sessions_all()
    man <- manual_with_dates(qd_manual())
    per <- character()
    if (!is.null(s) && nrow(s) > 0) per <- format(floor_date(s$Date, "month"), "%Y-%m")
    if (nrow(man) > 0)              per <- c(per, format(man$PeriodDate, "%Y-%m"))
    per <- sort(unique(per))
    chs <- c("All periods" = "all")
    if (length(per)) {
      lbl <- format(as.Date(paste0(per, "-01")), "%B %Y")
      chs <- c(chs, stats::setNames(per, lbl))
    }
    cur <- isolate(input$qd_period)
    sel <- if (!is.null(cur) && cur %in% chs) cur else "all"
    updateSelectInput(session, "qd_period", choices = chs, selected = sel)
  })
  
  qd_window <- reactive({
    p <- input$qd_period %||% "all"
    if (is.null(p) || p == "all" || !nzchar(p)) return(NULL)
    st <- suppressWarnings(as.Date(paste0(p, "-01")))
    if (is.na(st)) return(NULL)
    list(start = st, end = ceiling_date(st, "month") - days(1))
  })
  
  qd_sessions_f <- reactive({
    s <- qd_sessions_all(); w <- qd_window()
    if (is.null(s) || nrow(s) == 0) return(NULL)
    if (!is.null(w)) s <- s %>% filter(Date >= w$start & Date <= w$end)
    if (nrow(s) == 0) NULL else s
  })
  
  qd_days_f <- reactive({
    d <- qd_days_all(); w <- qd_window()
    if (is.null(d) || nrow(d) == 0) return(NULL)
    if (!is.null(w)) d <- d %>% filter(Date >= w$start & Date <= w$end)
    if (nrow(d) == 0) NULL else d
  })
  
  qd_manual_f <- reactive({
    if ((input$qd_include_manual %||% "yes") != "yes") return(manual_with_dates(empty_manual_tbl()))
    w <- qd_window()
    if (is.null(w)) manual_with_dates(qd_manual())
    else filter_manual_window(qd_manual(), w$start, w$end)
  })
  
  # ---- Qiddiya totals -------------------------------------------------
  qd_totals <- reactive({
    s <- qd_sessions_f(); d <- qd_days_f(); man <- qd_manual_f()
    wb_p <- if (is.null(s)) 0 else sum(s$Students, na.rm = TRUE)
    wb_s <- if (is.null(s)) 0 else nrow(s)
    wb_d <- if (is.null(d)) 0 else nrow(d)
    mn_p <- if (nrow(man) == 0) 0 else sum(man$Participants, na.rm = TRUE)
    mn_s <- if (nrow(man) == 0) 0 else sum(man$Sessions, na.rm = TRUE)
    mn_d <- if (nrow(man) == 0) 0 else sum(man$TeachingDays, na.rm = TRUE)
    list(wb_p = wb_p, wb_s = wb_s, wb_d = wb_d,
         mn_p = mn_p, mn_s = mn_s, mn_d = mn_d,
         participants = wb_p + mn_p, sessions = wb_s + mn_s, days = wb_d + mn_d,
         instructors = if (is.null(d)) 0 else n_distinct(d$Instructor),
         courses     = if (is.null(s)) 0 else n_distinct(s$Course))
  })
  
  output$qd_kpi_participants <- renderUI({ big_num(qd_totals()$participants) })
  output$qd_kpi_sessions     <- renderUI({ big_num(qd_totals()$sessions) })
  output$qd_kpi_days         <- renderUI({ big_num(qd_totals()$days) })
  
  output$qd_kpi_avg <- renderUI({
    t <- qd_totals()
    if (t$sessions == 0) return(span("N/A", style = "font-size: 2.2rem; font-weight: 700;"))
    span(round(t$participants / t$sessions, 1),
         style = "font-size: 2.2rem; font-weight: 700;")
  })
  
  qd_split_note <- function(wb, mn) {
    div(class = "small",
        span(paste0(fmt_int(wb), " from workbook")),
        if (mn > 0) span(paste0(" + ", fmt_int(mn), " manual")) else NULL)
  }
  
  output$qd_kpi_participants_sub <- renderUI({ t <- qd_totals(); qd_split_note(t$wb_p, t$mn_p) })
  output$qd_kpi_sessions_sub     <- renderUI({ t <- qd_totals(); qd_split_note(t$wb_s, t$mn_s) })
  output$qd_kpi_days_sub         <- renderUI({
    t <- qd_totals()
    div(class = "small",
        span(paste0(fmt_int(t$wb_d), " from workbook")),
        if (t$mn_d > 0) span(paste0(" + ", fmt_int(t$mn_d), " manual")) else NULL,
        if (t$instructors > 0) span(paste0(" | ", t$instructors, " instructors")) else NULL)
  })
  
  # ---- Qiddiya monthly aggregation ------------------------------------
  qd_monthly <- reactive({
    s <- qd_sessions_f(); d <- qd_days_f(); man <- qd_manual_f()
    parts <- list()
    
    if (!is.null(s) && nrow(s) > 0) {
      parts[[length(parts) + 1]] <- s %>%
        mutate(Month = floor_date(Date, "month")) %>%
        group_by(Month) %>%
        summarise(Participants = sum(Students, na.rm = TRUE),
                  Sessions = n(), TeachingDays = 0, .groups = "drop")
    }
    if (!is.null(d) && nrow(d) > 0) {
      parts[[length(parts) + 1]] <- d %>%
        mutate(Month = floor_date(Date, "month")) %>%
        group_by(Month) %>%
        summarise(Participants = 0, Sessions = 0, TeachingDays = n(), .groups = "drop")
    }
    if (nrow(man) > 0) {
      parts[[length(parts) + 1]] <- man %>%
        group_by(Month = PeriodDate) %>%
        summarise(Participants = sum(Participants, na.rm = TRUE),
                  Sessions = sum(Sessions, na.rm = TRUE),
                  TeachingDays = sum(TeachingDays, na.rm = TRUE), .groups = "drop")
    }
    if (!length(parts)) return(NULL)
    
    bind_rows(parts) %>%
      group_by(Month) %>%
      summarise(Participants = sum(Participants, na.rm = TRUE),
                Sessions = sum(Sessions, na.rm = TRUE),
                TeachingDays = sum(TeachingDays, na.rm = TRUE), .groups = "drop") %>%
      arrange(Month) %>%
      mutate(MonthLabel = format(Month, "%b %Y"))
  })
  
  output$qd_monthly_chart <- renderPlotly({
    m <- qd_monthly()
    if (is.null(m) || nrow(m) == 0) return(qd_empty_plot("No Qiddiya data for this selection"))
    m$MonthLabel <- factor(m$MonthLabel, levels = m$MonthLabel)
    plot_ly(m, x = ~MonthLabel, y = ~Participants, type = "bar",
            marker = list(color = NEFT_NAVY,
                          line = list(color = NEFT_GOLD, width = 1.5)),
            text = ~format(Participants, big.mark = ","),
            textposition = "outside",
            textfont = list(size = 12, color = NEFT_NAVY),
            hovertemplate = "<b>%{x}</b><br>Participants: %{y}<extra></extra>") %>%
      layout(xaxis = list(title = "", tickfont = list(size = 11)),
             yaxis = list(title = "Participants",
                          range = c(0, max(m$Participants, na.rm = TRUE) * 1.25 + 1)),
             margin = chart_margin_v, showlegend = FALSE)
  })
  
  output$qd_monthly_sessions_chart <- renderPlotly({
    m <- qd_monthly()
    if (is.null(m) || nrow(m) == 0) return(qd_empty_plot("No Qiddiya data for this selection"))
    m$MonthLabel <- factor(m$MonthLabel, levels = m$MonthLabel)
    plot_ly(m, x = ~MonthLabel) %>%
      add_bars(y = ~Sessions, name = "Sessions",
               marker = list(color = NEFT_GOLD),
               hovertemplate = "<b>%{x}</b><br>Sessions: %{y}<extra></extra>") %>%
      add_bars(y = ~TeachingDays, name = "Teaching Days",
               marker = list(color = NEFT_NAVY),
               hovertemplate = "<b>%{x}</b><br>Teaching days: %{y}<extra></extra>") %>%
      layout(barmode = "group",
             xaxis = list(title = "", tickfont = list(size = 11)),
             yaxis = list(title = "Count"),
             legend = list(orientation = "h", x = 0, y = 1.12),
             margin = chart_margin_v)
  })
  
  output$qd_instructor_chart <- renderPlotly({
    d <- qd_days_f()
    if (is.null(d) || nrow(d) == 0) return(qd_empty_plot("No instructor data in the workbook"))
    s <- qd_sessions_f()
    top <- d %>% count(Instructor, name = "TeachingDays") %>%
      arrange(desc(TeachingDays)) %>% head(10)
    if (!is.null(s) && nrow(s) > 0) {
      st <- s %>% group_by(Instructor) %>%
        summarise(Students = sum(Students, na.rm = TRUE), .groups = "drop")
      top <- top %>% left_join(st, by = "Instructor") %>%
        mutate(Students = ifelse(is.na(Students), 0, Students))
    } else {
      top$Students <- 0
    }
    plot_ly(top, y = ~reorder(Instructor, TeachingDays), x = ~TeachingDays,
            type = "bar", orientation = "h",
            marker = list(color = NEFT_NAVY),
            text = ~paste0(TeachingDays, " days | ", Students, " participants"),
            textposition = "outside",
            textfont = list(size = 11, color = NEFT_NAVY),
            hovertemplate = "<b>%{y}</b><br>Teaching days: %{x}<extra></extra>") %>%
      layout(xaxis = list(title = "Teaching Days",
                          range = c(0, max(top$TeachingDays, na.rm = TRUE) * 1.6 + 1)),
             yaxis = list(title = "", tickfont = list(size = 11)),
             margin = chart_margin_h, showlegend = FALSE)
  })
  
  output$qd_course_chart <- renderPlotly({
    s <- qd_sessions_f()
    if (is.null(s) || nrow(s) == 0) return(qd_empty_plot("No course data in the workbook"))
    top <- s %>% group_by(Course) %>%
      summarise(Participants = sum(Students, na.rm = TRUE), Sessions = n(), .groups = "drop") %>%
      arrange(desc(Participants)) %>% head(10)
    plot_ly(top, y = ~reorder(Course, Participants), x = ~Participants,
            type = "bar", orientation = "h",
            marker = list(color = NEFT_GOLD,
                          line = list(color = NEFT_NAVY, width = 1)),
            text = ~paste0(Participants, " (", Sessions, " sessions)"),
            textposition = "outside",
            textfont = list(size = 11, color = NEFT_NAVY),
            hovertemplate = "<b>%{y}</b><br>Participants: %{x}<extra></extra>") %>%
      layout(xaxis = list(title = "Participants",
                          range = c(0, max(top$Participants, na.rm = TRUE) * 1.5 + 1)),
             yaxis = list(title = "", tickfont = list(size = 10)),
             margin = chart_margin_h, showlegend = FALSE)
  })
  
  output$qd_class_chart <- renderPlotly({
    s <- qd_sessions_f(); d <- qd_days_f()
    if (is.null(s) || nrow(s) == 0) return(qd_empty_plot("No class data in the workbook"))
    cl <- s %>% group_by(Class) %>%
      summarise(Participants = sum(Students, na.rm = TRUE), Sessions = n(), .groups = "drop")
    if (!is.null(d) && nrow(d) > 0) {
      cd <- d %>% count(Class, name = "TeachingDays")
      cl <- cl %>% left_join(cd, by = "Class") %>%
        mutate(TeachingDays = ifelse(is.na(TeachingDays), 0, TeachingDays))
    } else {
      cl$TeachingDays <- 0
    }
    cl <- cl %>% arrange(desc(Participants))
    plot_ly(cl, x = ~factor(Class, levels = cl$Class)) %>%
      add_bars(y = ~Participants, name = "Participants",
               marker = list(color = NEFT_NAVY),
               text = ~Participants, textposition = "outside",
               textfont = list(size = 11, color = NEFT_NAVY)) %>%
      add_bars(y = ~TeachingDays, name = "Teaching Days",
               marker = list(color = NEFT_GOLD)) %>%
      layout(barmode = "group",
             xaxis = list(title = "", tickfont = list(size = 10)),
             yaxis = list(title = "Count",
                          range = c(0, max(cl$Participants, na.rm = TRUE) * 1.25 + 1)),
             legend = list(orientation = "h", x = 0, y = 1.12),
             margin = chart_margin_v)
  })
  
  output$qd_daily_chart <- renderPlotly({
    s <- qd_sessions_f()
    if (is.null(s) || nrow(s) == 0) return(qd_empty_plot("No daily data in the workbook"))
    dly <- s %>% group_by(Date) %>%
      summarise(Participants = sum(Students, na.rm = TRUE),
                Sessions = n(), .groups = "drop") %>% arrange(Date)
    plot_ly(dly, x = ~Date, y = ~Participants, type = "scatter", mode = "lines+markers",
            fill = "tozeroy",
            fillcolor = "rgba(0, 33, 71, 0.15)",
            line = list(color = NEFT_NAVY, width = 2.5),
            marker = list(color = NEFT_GOLD, size = 7,
                          line = list(color = NEFT_NAVY, width = 1)),
            hovertemplate = "<b>%{x|%d %b %Y}</b><br>Participants: %{y}<extra></extra>") %>%
      layout(xaxis = list(title = "", tickfont = list(size = 10)),
             yaxis = list(title = "Participants"),
             margin = chart_margin_v, showlegend = FALSE)
  })
  
  output$qd_detail_table <- DT::renderDataTable({
    s <- qd_sessions_f()
    if (is.null(s) || nrow(s) == 0) {
      return(DT::datatable(
        data.frame(Message = "No Qiddiya workbook rows for this selection."),
        rownames = FALSE, options = list(dom = "t")))
    }
    tbl <- s %>%
      arrange(Date, Class) %>%
      transmute(Date = format(Date, "%d %b %Y"),
                Class, Course, Instructor,
                Participants = Students,
                `Session Days` = SessionDays,
                Source = SourceFile)
    DT::datatable(tbl, filter = "top", rownames = FALSE,
                  options = list(pageLength = 15, scrollX = TRUE),
                  class = "stripe hover")
  })
  
  # ---- Takamol --------------------------------------------------------
  tk_data <- reactive({ manual_with_dates(tk_manual()) })
  
  tk_totals <- reactive({
    d <- tk_data()
    if (nrow(d) == 0) return(list(participants = 0, sessions = 0, periods = 0, avg = 0))
    list(participants = sum(d$Participants, na.rm = TRUE),
         sessions     = sum(d$Sessions, na.rm = TRUE),
         periods      = n_distinct(d$PeriodDate),
         avg          = round(sum(d$Participants, na.rm = TRUE) / max(1, n_distinct(d$PeriodDate)), 1))
  })
  
  output$tk_kpi_participants <- renderUI({ big_num(tk_totals()$participants) })
  output$tk_kpi_sessions     <- renderUI({ big_num(tk_totals()$sessions) })
  output$tk_kpi_periods      <- renderUI({ big_num(tk_totals()$periods) })
  output$tk_kpi_avg <- renderUI({
    t <- tk_totals()
    span(if (t$periods == 0) "N/A" else t$avg,
         style = "font-size: 2.2rem; font-weight: 700;")
  })
  
  output$tk_kpi_participants_sub <- renderUI({
    d <- tk_data()
    if (nrow(d) == 0) return(div(class = "small", "No entries yet - add one below"))
    div(class = "small", paste0(format(min(d$PeriodDate), "%b %Y"), " to ",
                                format(max(d$PeriodDate), "%b %Y")))
  })
  
  output$tk_kpi_periods_sub <- renderUI({
    d <- tk_data()
    if (nrow(d) == 0) return(NULL)
    div(class = "small", paste0(n_distinct(d$Year), " year(s) recorded"))
  })
  
  output$tk_monthly_chart <- renderPlotly({
    d <- tk_data()
    if (nrow(d) == 0) return(qd_empty_plot("Add Takamol numbers to see this chart"))
    m <- d %>% group_by(PeriodDate) %>%
      summarise(Participants = sum(Participants, na.rm = TRUE), .groups = "drop") %>%
      arrange(PeriodDate) %>% mutate(Label = format(PeriodDate, "%b %Y"))
    m$Label <- factor(m$Label, levels = m$Label)
    plot_ly(m, x = ~Label, y = ~Participants, type = "bar",
            marker = list(color = NEFT_NAVY, line = list(color = NEFT_GOLD, width = 1.5)),
            text = ~format(Participants, big.mark = ","),
            textposition = "outside",
            textfont = list(size = 12, color = NEFT_NAVY),
            hovertemplate = "<b>%{x}</b><br>Participants: %{y}<extra></extra>") %>%
      layout(xaxis = list(title = "", tickfont = list(size = 11)),
             yaxis = list(title = "Participants",
                          range = c(0, max(m$Participants, na.rm = TRUE) * 1.25 + 1)),
             margin = chart_margin_v, showlegend = FALSE)
  })
  
  output$tk_cumulative_chart <- renderPlotly({
    d <- tk_data()
    if (nrow(d) == 0) return(qd_empty_plot("Add Takamol numbers to see this chart"))
    m <- d %>% group_by(PeriodDate) %>%
      summarise(Participants = sum(Participants, na.rm = TRUE), .groups = "drop") %>%
      arrange(PeriodDate) %>% mutate(Cumulative = cumsum(Participants),
                                     Label = format(PeriodDate, "%b %Y"))
    m$Label <- factor(m$Label, levels = m$Label)
    plot_ly(m, x = ~Label, y = ~Cumulative, type = "scatter", mode = "lines+markers",
            fill = "tozeroy", fillcolor = "rgba(255, 192, 0, 0.25)",
            line = list(color = NEFT_GOLD, width = 3),
            marker = list(color = NEFT_NAVY, size = 8),
            hovertemplate = "<b>%{x}</b><br>Cumulative: %{y}<extra></extra>") %>%
      layout(xaxis = list(title = "", tickfont = list(size = 11)),
             yaxis = list(title = "Cumulative Participants"),
             margin = chart_margin_v, showlegend = FALSE)
  })
  
  output$tk_yearly_chart <- renderPlotly({
    d <- tk_data()
    if (nrow(d) == 0) return(qd_empty_plot("Add Takamol numbers to see this chart"))
    y <- d %>% group_by(Year) %>%
      summarise(Participants = sum(Participants, na.rm = TRUE), .groups = "drop") %>%
      arrange(Year)
    plot_ly(y, x = ~factor(Year), y = ~Participants, type = "bar",
            marker = list(color = NEFT_NAVY, line = list(color = NEFT_GOLD, width = 1.5)),
            text = ~format(Participants, big.mark = ","),
            textposition = "outside",
            textfont = list(size = 13, color = NEFT_NAVY),
            hovertemplate = "<b>%{x}</b><br>Participants: %{y}<extra></extra>") %>%
      layout(xaxis = list(title = "Year"),
             yaxis = list(title = "Participants",
                          range = c(0, max(y$Participants, na.rm = TRUE) * 1.25 + 1)),
             margin = chart_margin_v, showlegend = FALSE)
  })
  
  # ---- Executive Summary: special project totals ----------------------
  exec_project_totals <- reactive({
    scope <- input$project_scope %||% "all"
    w <- NULL
    if (scope == "period") {
      ps <- period_stats()
      if (!is.null(ps)) w <- list(start = ps$cur_start, end = ps$cur_end)
    }
    
    s <- qd_sessions_all(); d <- qd_days_all()
    if (!is.null(w)) {
      if (!is.null(s) && nrow(s) > 0) s <- s %>% filter(Date >= w$start & Date <= w$end)
      if (!is.null(d) && nrow(d) > 0) d <- d %>% filter(Date >= w$start & Date <= w$end)
    }
    qman <- if (is.null(w)) manual_with_dates(qd_manual()) else filter_manual_window(qd_manual(), w$start, w$end)
    tman <- if (is.null(w)) manual_with_dates(tk_manual()) else filter_manual_window(tk_manual(), w$start, w$end)
    
    qd_p <- (if (is.null(s)) 0 else sum(s$Students, na.rm = TRUE)) +
      (if (nrow(qman) == 0) 0 else sum(qman$Participants, na.rm = TRUE))
    qd_s <- (if (is.null(s)) 0 else nrow(s)) +
      (if (nrow(qman) == 0) 0 else sum(qman$Sessions, na.rm = TRUE))
    qd_d <- (if (is.null(d)) 0 else nrow(d)) +
      (if (nrow(qman) == 0) 0 else sum(qman$TeachingDays, na.rm = TRUE))
    tk_p <- if (nrow(tman) == 0) 0 else sum(tman$Participants, na.rm = TRUE)
    tk_s <- if (nrow(tman) == 0) 0 else sum(tman$Sessions, na.rm = TRUE)
    
    # Core = the existing NEFT dataset, untouched
    core_p <- 0; core_s <- 0
    if (scope == "period") {
      ps <- period_stats()
      if (!is.null(ps)) {
        core_p <- nrow(ps$cur_df)
        core_s <- n_distinct(ps$cur_df$`Actual Sessions`)
      }
    } else {
      core <- df_data_local()
      if (!is.null(core)) {
        core_p <- nrow(core)
        core_s <- n_distinct(core$`Actual Sessions`)
      }
    }
    
    list(scope = scope,
         label = if (scope == "period") (period_stats()$label_main %||% "Selected period") else "All records",
         qd_p = qd_p, qd_s = qd_s, qd_d = qd_d, tk_p = tk_p, tk_s = tk_s,
         core_p = core_p, core_s = core_s,
         grand_p = core_p + qd_p + tk_p,
         grand_s = core_s + qd_s + tk_s)
  })
  
  output$exec_qd_participants <- renderUI({ big_num(exec_project_totals()$qd_p) })
  output$exec_tk_participants <- renderUI({ big_num(exec_project_totals()$tk_p) })
  output$exec_grand_participants <- renderUI({ big_num(exec_project_totals()$grand_p) })
  output$exec_grand_sessions <- renderUI({ big_num(exec_project_totals()$grand_s) })
  
  output$exec_qd_sub <- renderUI({
    t <- exec_project_totals()
    div(class = "small",
        paste0(fmt_int(t$qd_s), " sessions | ", fmt_int(t$qd_d), " teaching days"))
  })
  
  output$exec_tk_sub <- renderUI({
    t <- exec_project_totals()
    div(class = "small",
        if (t$tk_s > 0) paste0(fmt_int(t$tk_s), " sessions") else "Manually entered")
  })
  
  output$exec_grand_participants_sub <- renderUI({
    t <- exec_project_totals()
    p(class = "small text-muted mb-0",
      paste0("Core ", fmt_int(t$core_p), " + Qiddiya ", fmt_int(t$qd_p),
             " + Takamol ", fmt_int(t$tk_p)))
  })
  
  output$exec_grand_sessions_sub <- renderUI({
    t <- exec_project_totals()
    p(class = "small text-muted mb-0",
      paste0("Core ", fmt_int(t$core_s), " + Qiddiya ", fmt_int(t$qd_s),
             " + Takamol ", fmt_int(t$tk_s)))
  })
  
  output$exec_projects_note <- renderUI({
    t <- exec_project_totals()
    div(class = "small text-muted mt-2",
        icon("circle-info"),
        paste0(" Scope: ", t$label,
               ". Qiddiya combines the QCTA workbook with manual entries; Takamol is fully manual. ",
               "The three KPI cards at the top of this page remain the core NEFT dataset only."))
  })
  
  
  # ============================================================
  # QUALITY METRICS (unchanged)
  # ============================================================
  output$instructor_performance_chart <- renderPlotly({
    sheet_data <- get_google_sheet_tab(input$question_choice_chart)
    if (is.null(sheet_data) || nrow(sheet_data) == 0) {
      return(plot_ly() %>% 
               add_annotations(text = "No data available for selected metric",
                               xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                               showarrow = FALSE, font = list(size = 16, color = "gray")))
    }
    
    instructor_col <- names(sheet_data)[1]
    names(sheet_data) <- trimws(names(sheet_data))
    
    if (ncol(sheet_data) < 6) {
      return(plot_ly() %>% 
               add_annotations(text = "Not enough columns found. Need at least 6 columns (Name + 5 score columns)",
                               xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                               showarrow = FALSE, font = list(size = 12, color = "gray")))
    }
    
    score_columns <- sheet_data[, 2:6]
    
    if (!all(sapply(score_columns, is.numeric))) {
      return(plot_ly() %>% 
               add_annotations(text = "Score columns (2-6) are not numeric. Please check your Google Sheets format.",
                               xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                               showarrow = FALSE, font = list(size = 12, color = "gray")))
    }
    
    calc_data <- data.frame(
      Instructor = sheet_data[[instructor_col]],
      Score_1 = as.numeric(score_columns[[1]]),
      Score_2 = as.numeric(score_columns[[2]]),
      Score_3 = as.numeric(score_columns[[3]]),
      Score_4 = as.numeric(score_columns[[4]]),
      Score_5 = as.numeric(score_columns[[5]]),
      stringsAsFactors = FALSE
    )
    
    instructor_scores <- calc_data %>%
      rowwise() %>%
      mutate(
        Score_1 = ifelse(is.na(Score_1), 0, Score_1),
        Score_2 = ifelse(is.na(Score_2), 0, Score_2),
        Score_3 = ifelse(is.na(Score_3), 0, Score_3),
        Score_4 = ifelse(is.na(Score_4), 0, Score_4),
        Score_5 = ifelse(is.na(Score_5), 0, Score_5),
        Total_Responses = Score_1 + Score_2 + Score_3 + Score_4 + Score_5,
        Weighted_Score = (Score_1*1) + (Score_2*2) + (Score_3*3) + (Score_4*4) + (Score_5*5),
        Avg_Score = ifelse(Total_Responses > 0, Weighted_Score / Total_Responses, 0)
      ) %>%
      ungroup() %>%
      select(Instructor, Avg_Score, Total_Responses) %>%
      filter(Total_Responses > 0) %>%
      arrange(desc(Avg_Score)) %>%
      head(10)
    
    if (nrow(instructor_scores) == 0) {
      return(plot_ly() %>% 
               add_annotations(text = "No instructor data with responses found",
                               xref = "paper", yref = "paper", x = 0.5, y = 0.5,
                               showarrow = FALSE, font = list(size = 16, color = "gray")))
    }
    
    instructor_scores <- instructor_scores %>%
      mutate(Color = case_when(
        Avg_Score >= 4.5 ~ "#388e3c",
        Avg_Score >= 4.0 ~ "#7cb342",
        Avg_Score >= 3.5 ~ "#fbc02d",
        Avg_Score >= 3.0 ~ "#f57c00",
        TRUE ~ "#d32f2f"
      ))
    
    plot_ly(instructor_scores, 
            y = ~reorder(Instructor, Avg_Score), 
            x = ~Avg_Score, 
            type = 'bar',
            orientation = 'h',
            marker = list(color = ~Color),
            text = ~paste0(round(Avg_Score, 2), " (", format(Total_Responses, big.mark=","), " resp.)"),
            textposition = 'outside',
            textfont = list(size = 10, family = "Inter"),
            hovertemplate = '<b>%{y}</b><br>Average Score: %{x:.2f}<br>Total Responses: %{customdata}<extra></extra>',
            customdata = ~Total_Responses) %>%
      layout(xaxis = list(title = "Average Score (1-5)", range = c(0, 5.8), tickfont = list(size = 10)),
             yaxis = list(title = "", tickfont = list(size = 10)),
             margin = list(l = 180, r = 120, t = 20, b = 40),
             showlegend = FALSE)
  })
  
  output$question_table <- DT::renderDataTable({
    sheet_data <- get_google_sheet_tab(input$question_choice)
    if (is.null(sheet_data)) {
      return(DT::datatable(data.frame(Message = "Unable to load Google Sheet data"), 
                           options = list(pageLength = 10, scrollX = TRUE)))
    }
    DT::datatable(sheet_data, options = list(pageLength = 10, scrollX = TRUE), 
                  class = 'stripe hover')
  })
  
  # ============================================================
  # DATA TABLE (unchanged)
  # ============================================================
  output$raw_data_table <- DT::renderDataTable({
    DT::datatable(valid_filtered_df(), filter = 'top', 
                  options = list(pageLength = 15, scrollX = TRUE),
                  class = 'stripe hover')
  })
  
  # ============================================================
  # DOWNLOADS (unchanged)
  # ============================================================
  output$downloadData <- downloadHandler(
    filename = function() { paste("NEFT-Data-", Sys.Date(), ".csv", sep = "") },
    content = function(file) { write.csv(valid_filtered_df(), file, row.names = FALSE) }
  )
  
  output$downloadReport <- downloadHandler(
    filename = function() { paste("NEFT-Report-", Sys.Date(), ".pdf", sep = "") },
    content = function(file) {
      tempReport <- file.path(tempdir(), "report.Rmd")
      file.copy("report.Rmd", tempReport, overwrite = TRUE)
      params <- list(start_date = input$date_picker[1], end_date = input$date_picker[2], 
                     full_data = df_data_local())
      showNotification("Generating PDF report...", duration = NULL, id = "pdf_gen")
      on.exit(removeNotification("pdf_gen"), add = TRUE)
      rmarkdown::render(tempReport, output_file = file, output_format = "pdf_document",
                        params = params, envir = new.env(parent = globalenv()))
    }
  )
}

# Run the app
shinyApp(ui, server)