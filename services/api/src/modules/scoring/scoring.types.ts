import { EvidenceKind } from './scoring.constants';

/** A question as stored on an assessment. */
export interface StoredQuestion {
  id: string;
  text: string;
  type: string;
  maxScore?: number;
  options?: string[];
  /**
   * Correct answer for objective questions. Stored server-side so grading is
   * deterministic, and stripped by `stripAnswerKey` before the assessment is
   * ever returned to a client.
   */
  correctAnswer?: string;
  /** Points a grader should look for in an open-ended answer. */
  expectedKeyPoints?: string[];
  [key: string]: unknown;
}

export interface SubmittedAnswer {
  questionId: string;
  answer: string;
}

/** How a single question's score was arrived at. */
export type GradeMethod = 'objective' | 'model' | 'blank' | 'unscored';

export interface GradedQuestion {
  questionId: string;
  /** Points awarded. Null when the question could not be graded. */
  score: number | null;
  maxScore: number;
  /** True/false for objective questions, null for open-ended. */
  correct: boolean | null;
  feedback: string;
  method: GradeMethod;
}

export interface ScoredSubmission {
  /** Points awarded across all gradable questions. */
  totalScore: number;
  /**
   * Total points that were actually gradable. Questions the model failed to
   * grade are excluded from BOTH totals, so a grading outage reads as a
   * smaller assessment rather than as a zero.
   */
  gradableMaxScore: number;
  /** Sum of every question's maxScore, gradable or not. */
  declaredMaxScore: number;
  /** totalScore / gradableMaxScore as a 0–100 percentage. Null if nothing graded. */
  percentage: number | null;
  feedback: string;
  questions: GradedQuestion[];
  /** True when at least one question could not be graded. */
  degraded: boolean;
}

export interface RecordEvidenceInput {
  userId: string;
  conceptId: string;
  kind: EvidenceKind;
  /** 0–1 how well they did. Omit for pure exposure. */
  scoreFraction?: number;
  difficulty?: string;
  /** Whether this counts as a review for scheduling purposes. */
  isReview?: boolean;
  occurredAt?: Date;
}
