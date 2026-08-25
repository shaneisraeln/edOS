import { Injectable, Logger } from '@nestjs/common';
import { AIService } from '../ai/ai.service';
import {
  DEFAULT_QUESTION_POINTS,
  OBJECTIVE_QUESTION_TYPES,
  clamp,
} from './scoring.constants';
import {
  GradedQuestion,
  ScoredSubmission,
  StoredQuestion,
  SubmittedAnswer,
} from './scoring.types';

/**
 * The single grader for every quiz, assessment, challenge and path check.
 *
 * Design rules, each one fixing a specific defect in the previous approach:
 *
 * 1. Objective questions (MCQ, true/false) are graded by comparison against a
 *    stored answer key — no model call, so results are reproducible and cannot
 *    drift between runs.
 * 2. The model is asked only about open-ended answers, with a strict JSON
 *    contract that is validated field by field.
 * 3. A question the model failed to grade is marked `unscored` and excluded
 *    from both the numerator and denominator. Previously a parse failure
 *    returned totalScore 0, which was indistinguishable from a genuinely wrong
 *    answer and silently destroyed the learner's mastery.
 * 4. Blank answers score 0 deterministically and never reach the model.
 * 5. Every score is clamped to [0, maxScore].
 */
@Injectable()
export class AnswerGraderService {
  private readonly logger = new Logger(AnswerGraderService.name);

  constructor(private readonly aiService: AIService) {}

  async grade(params: {
    questions: StoredQuestion[];
    answers: SubmittedAnswer[];
    topic: string;
  }): Promise<ScoredSubmission> {
    const { questions, topic } = params;
    const answerMap = new Map(
      (params.answers || []).map((a) => [a.questionId, (a.answer ?? '').trim()]),
    );

    const graded: GradedQuestion[] = [];
    const needsModel: { question: StoredQuestion; answer: string }[] = [];

    for (const question of questions || []) {
      const maxScore = this.pointsFor(question);
      const answer = answerMap.get(question.id) ?? '';

      if (!answer) {
        graded.push({
          questionId: question.id,
          score: 0,
          maxScore,
          correct: false,
          feedback: 'No answer given.',
          method: 'blank',
        });
        continue;
      }

      if (this.isObjective(question)) {
        graded.push(this.gradeObjective(question, answer, maxScore));
        continue;
      }

      needsModel.push({ question, answer });
    }

    if (needsModel.length > 0) {
      graded.push(...(await this.gradeOpenEnded(needsModel, topic)));
    }

    // Restore the original question order so the client can zip them up.
    const order = new Map((questions || []).map((q, i) => [q.id, i]));
    graded.sort((a, b) => (order.get(a.questionId) ?? 0) - (order.get(b.questionId) ?? 0));

    return this.summarise(graded, topic);
  }

  // ------------------------------------------------------------- objective

  private isObjective(question: StoredQuestion): boolean {
    const type = String(question.type || '').toLowerCase();
    const hasKey = typeof question.correctAnswer === 'string' && question.correctAnswer.length > 0;
    return hasKey && OBJECTIVE_QUESTION_TYPES.includes(type);
  }

  private gradeObjective(
    question: StoredQuestion,
    answer: string,
    maxScore: number,
  ): GradedQuestion {
    const correct = this.matchesKey(question, answer);

    return {
      questionId: question.id,
      score: correct ? maxScore : 0,
      maxScore,
      correct,
      feedback: correct
        ? 'Correct.'
        : `Not correct. The expected answer was: ${question.correctAnswer}`,
      method: 'objective',
    };
  }

  /**
   * Accept the answer in any of the forms a client might submit it: the option
   * text, the option letter ("B"), or the zero-based index.
   */
  private matchesKey(question: StoredQuestion, answer: string): boolean {
    const key = String(question.correctAnswer ?? '');
    const given = answer.trim();

    if (this.looseEqual(given, key)) return true;

    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length === 0) return false;

    const keyIndex = options.findIndex((opt) => this.looseEqual(String(opt), key));
    if (keyIndex === -1) return false;

    // Letter form, e.g. "B" or "b)".
    const letter = given.replace(/[^a-z]/gi, '').toLowerCase();
    if (letter.length === 1) {
      if (letter.charCodeAt(0) - 97 === keyIndex) return true;
    }

    // Numeric form, either 0-based or 1-based. Only when the answer really is
    // just a number — stripping non-digits from prose would leave an empty
    // string, and Number('') is 0, which would false-match option index 0.
    if (/^\s*\d+\s*$/.test(given)) {
      const numeric = Number(given.trim());
      if (numeric === keyIndex || numeric === keyIndex + 1) return true;
    }

    // Selected option text matches the key's option.
    const givenIndex = options.findIndex((opt) => this.looseEqual(String(opt), given));
    return givenIndex !== -1 && givenIndex === keyIndex;
  }

  private looseEqual(a: string, b: string): boolean {
    const normalise = (s: string) =>
      s
        .toLowerCase()
        .replace(/^[a-d][).:\s]+/i, '') // strip a leading "b) " style prefix
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    return normalise(a) === normalise(b) && normalise(a).length > 0;
  }

  // ------------------------------------------------------------ open ended

  private async gradeOpenEnded(
    items: { question: StoredQuestion; answer: string }[],
    topic: string,
  ): Promise<GradedQuestion[]> {
    const payload = items.map(({ question, answer }) => ({
      questionId: question.id,
      question: question.text,
      maxScore: this.pointsFor(question),
      expectedKeyPoints: question.expectedKeyPoints ?? [],
      answer,
    }));

    let parsed: unknown;
    try {
      const result = await this.aiService.getProvider().complete({
        systemPrompt: `You are an assessment scorer. Grade each open-ended answer against the question it belongs to.

Scoring rules:
- Award points out of that question's maxScore.
- Give partial credit for partially correct answers.
- Judge understanding, not wording or length. A short correct answer scores full marks.
- An answer that is confidently wrong scores 0.
- Do not reward restating the question.

Return ONLY this JSON, with one entry per question you were given:
{
  "questions": [
    { "questionId": "<id>", "score": <number>, "feedback": "<one sentence>" }
  ],
  "feedback": "<two sentences of overall feedback>"
}`,
        messages: [
          {
            role: 'user',
            content: `Topic: ${topic}\n\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
        temperature: 0.2,
        responseFormat: 'json',
      });

      parsed = JSON.parse(result.content);
    } catch (err: any) {
      this.logger.warn(
        `Open-ended grading unavailable (${err?.message ?? 'unknown error'}); ${items.length} question(s) left unscored`,
      );
      return items.map(({ question }) => this.unscored(question));
    }

    return this.mapModelGrades(items, parsed);
  }

  /**
   * Validate the model's response per question. Anything missing, malformed or
   * out of range leaves that question unscored rather than guessing.
   */
  private mapModelGrades(
    items: { question: StoredQuestion; answer: string }[],
    parsed: unknown,
  ): GradedQuestion[] {
    const root = (parsed ?? {}) as Record<string, unknown>;
    const rows = Array.isArray(root.questions) ? root.questions : [];

    const byId = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (row && typeof row === 'object') {
        const id = String((row as Record<string, unknown>).questionId ?? '');
        if (id) byId.set(id, row as Record<string, unknown>);
      }
    }

    const overall = typeof root.feedback === 'string' ? root.feedback : '';

    return items.map(({ question }) => {
      const maxScore = this.pointsFor(question);
      const row = byId.get(question.id);
      const rawScore = row ? Number(row.score) : NaN;

      if (!row || !Number.isFinite(rawScore)) {
        return this.unscored(question);
      }

      const score = clamp(Math.round(rawScore), 0, maxScore);
      const feedback =
        typeof row.feedback === 'string' && row.feedback.trim()
          ? row.feedback.trim()
          : overall || 'Scored.';

      return {
        questionId: question.id,
        score,
        maxScore,
        correct: null,
        feedback,
        method: 'model' as const,
      };
    });
  }

  private unscored(question: StoredQuestion): GradedQuestion {
    return {
      questionId: question.id,
      score: null,
      maxScore: this.pointsFor(question),
      correct: null,
      feedback: 'Could not be graded automatically. This question was excluded from your score.',
      method: 'unscored',
    };
  }

  // --------------------------------------------------------------- summary

  private summarise(graded: GradedQuestion[], topic: string): ScoredSubmission {
    const declaredMaxScore = graded.reduce((sum, q) => sum + q.maxScore, 0);
    const scored = graded.filter((q) => q.score !== null);

    const totalScore = scored.reduce((sum, q) => sum + (q.score ?? 0), 0);
    const gradableMaxScore = scored.reduce((sum, q) => sum + q.maxScore, 0);
    const percentage =
      gradableMaxScore > 0 ? clamp((totalScore / gradableMaxScore) * 100, 0, 100) : null;

    return {
      totalScore,
      gradableMaxScore,
      declaredMaxScore,
      percentage,
      feedback: this.buildFeedback(graded, percentage, topic),
      questions: graded,
      degraded: scored.length !== graded.length,
    };
  }

  private buildFeedback(
    graded: GradedQuestion[],
    percentage: number | null,
    topic: string,
  ): string {
    if (percentage === null) {
      return `We could not grade this attempt on ${topic}. Nothing was recorded against your mastery.`;
    }

    const modelFeedback = graded.find((q) => q.method === 'model' && q.feedback)?.feedback;
    const band =
      percentage >= 85
        ? `Strong grasp of ${topic}.`
        : percentage >= 60
          ? `Solid understanding of ${topic} with some gaps.`
          : percentage >= 35
            ? `Partial understanding of ${topic}. Worth another pass.`
            : `${topic} needs revisiting from the fundamentals.`;

    const missed = graded.filter((q) => q.correct === false).length;
    const missedNote = missed > 0 ? ` ${missed} question${missed === 1 ? '' : 's'} went wrong.` : '';
    const degradedNote = graded.some((q) => q.method === 'unscored')
      ? ' Some questions could not be graded and were left out of the total.'
      : '';

    return `${band}${missedNote}${modelFeedback ? ` ${modelFeedback}` : ''}${degradedNote}`;
  }

  private pointsFor(question: StoredQuestion): number {
    const raw = Number(question?.maxScore);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_QUESTION_POINTS;
  }
}

/**
 * Remove answer keys before questions leave the server.
 *
 * Objective grading requires storing the correct answer alongside the question,
 * so every read path that returns an assessment must run its questions through
 * this first or the quiz gives itself away.
 */
export function stripAnswerKey<T extends Record<string, unknown>>(questions: T[]): T[] {
  return (questions || []).map((q) => {
    const { correctAnswer, expectedKeyPoints, ...rest } = q as Record<string, unknown>;
    return rest as T;
  });
}
