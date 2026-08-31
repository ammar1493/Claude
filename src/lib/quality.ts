import { DANGER, NEFT_GOLD, NEFT_GREEN, NEFT_TEAL } from "./brand";

export interface QualityRow {
  instructor: string;
  counts: [number, number, number, number, number];
}

export interface QualitySheet {
  question: string;
  sheet: string;
  rows: QualityRow[];
}

/** Weighted mean of the 1..5 buckets — the calculation app.R performed. */
export function weightedAverage(counts: readonly number[]): { avg: number; responses: number } {
  let responses = 0;
  let weighted = 0;
  for (let i = 0; i < 5; i += 1) {
    const c = Number.isFinite(counts[i]) ? counts[i] : 0;
    responses += c;
    weighted += c * (i + 1);
  }
  return { avg: responses > 0 ? weighted / responses : 0, responses };
}

export interface QuestionSummary {
  question: string;
  sheet: string;
  /** Short form for a column header: "Q1". */
  code: string;
  avg: number;
  responses: number;
}

export interface InstructorSummary {
  instructor: string;
  /** Average per question sheet, keyed by sheet name; absent when unrated. */
  byQuestion: Map<string, { avg: number; responses: number }>;
  avg: number;
  responses: number;
  /** Questions this instructor scores lowest on, weakest first. */
  weakest: { sheet: string; code: string; avg: number }[];
}

export interface QualityScorecard {
  questions: QuestionSummary[];
  instructors: InstructorSummary[];
  overallAvg: number;
  totalResponses: number;
  /** Total responses in each of the 1..5 buckets. */
  distribution: [number, number, number, number, number];
}

/**
 * Rolls the per-question sheets into one scorecard: an average per question,
 * an average per instructor per question, and the overall picture.
 *
 * Averages are weighted by responses throughout, so an instructor with 200
 * responses counts for more than one with 12 — a plain mean of means would let
 * a thinly rated instructor swing the headline.
 */
export function buildScorecard(sheets: QualitySheet[]): QualityScorecard {
  const questions: QuestionSummary[] = [];
  const perInstructor = new Map<string, Map<string, { avg: number; responses: number }>>();
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  sheets.forEach((sheet, index) => {
    let qWeighted = 0;
    let qResponses = 0;

    for (const row of sheet.rows) {
      const { avg, responses } = weightedAverage(row.counts);
      if (!responses) continue;
      qWeighted += avg * responses;
      qResponses += responses;
      for (let i = 0; i < 5; i += 1) distribution[i] += row.counts[i] ?? 0;

      let byQuestion = perInstructor.get(row.instructor);
      if (!byQuestion) {
        byQuestion = new Map();
        perInstructor.set(row.instructor, byQuestion);
      }
      // A repeated instructor row is merged rather than overwritten.
      const existing = byQuestion.get(sheet.sheet);
      if (existing) {
        const total = existing.responses + responses;
        byQuestion.set(sheet.sheet, {
          avg: (existing.avg * existing.responses + avg * responses) / total,
          responses: total,
        });
      } else {
        byQuestion.set(sheet.sheet, { avg, responses });
      }
    }

    questions.push({
      question: sheet.question,
      sheet: sheet.sheet,
      code: questionCode(sheet.question, index),
      avg: qResponses ? qWeighted / qResponses : 0,
      responses: qResponses,
    });
  });

  const instructors: InstructorSummary[] = [...perInstructor.entries()]
    .map(([instructor, byQuestion]) => {
      let weighted = 0;
      let responses = 0;
      for (const v of byQuestion.values()) {
        weighted += v.avg * v.responses;
        responses += v.responses;
      }
      const weakest = [...byQuestion.entries()]
        .map(([sheet, v]) => ({
          sheet,
          code: questions.find((q) => q.sheet === sheet)?.code ?? sheet,
          avg: v.avg,
        }))
        .sort((a, b) => a.avg - b.avg)
        .slice(0, 3);
      return {
        instructor,
        byQuestion,
        avg: responses ? weighted / responses : 0,
        responses,
        weakest,
      };
    })
    .filter((i) => i.responses > 0)
    .sort((a, b) => b.avg - a.avg);

  const totalResponses = distribution.reduce((a, b) => a + b, 0);
  const overallAvg = totalResponses
    ? distribution.reduce((a, c, i) => a + c * (i + 1), 0) / totalResponses
    : 0;

  return { questions, instructors, overallAvg, totalResponses, distribution };
}

/** "Q1 = Was the instructor well prepared?" -> "Q1" */
function questionCode(label: string, index: number): string {
  const m = /^(Q\d+)/i.exec(label.trim());
  return m ? m[1].toUpperCase() : `Q${index + 1}`;
}

/** The label without its "Qn = " prefix. */
export function questionText(label: string): string {
  return label.replace(/^Q\d+\s*=\s*/i, "").trim();
}

/**
 * Score bands. Discrete bands read better than a continuous ramp on a
 * scorecard: the question is "is this good", not "how many hundredths".
 */
export function scoreColor(score: number): string {
  if (score >= 4.5) return NEFT_GREEN;
  if (score >= 4.0) return NEFT_TEAL;
  if (score >= 3.5) return NEFT_GOLD;
  if (score >= 3.0) return "#C98A1E";
  return DANGER;
}

/** Text colour that stays readable on the band above. */
export function scoreTextColor(score: number): string {
  return score >= 4.5 || score < 3.0 ? "#ffffff" : score >= 4.0 ? "#ffffff" : "#001A45";
}

export const SCORE_BANDS = [
  { label: "4.5 – 5.0", color: NEFT_GREEN },
  { label: "4.0 – 4.5", color: NEFT_TEAL },
  { label: "3.5 – 4.0", color: NEFT_GOLD },
  { label: "3.0 – 3.5", color: "#C98A1E" },
  { label: "below 3.0", color: DANGER },
];
