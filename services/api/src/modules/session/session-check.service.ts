import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Not, Repository } from 'typeorm';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { AIService } from '../ai/ai.service';
import { AnswerGraderService } from '../scoring/answer-grader.service';
import { MasteryService } from '../scoring/mastery.service';
import { ConceptResolverService } from '../scoring/concept-resolver.service';
import { DEFAULT_QUESTION_POINTS, PASS_RATIO } from '../scoring/scoring.constants';
import { DEFAULT_CHECK_INTERVAL_SECONDS, MIN_CHECK_INTERVAL_SECONDS, Surface } from './session.constants';

/** A knowledge check handed to exactly one surface to present. */
export interface SessionCheck {
  id: string;
  question: string;
  type: string;
  /** Which surface was asked to show it, so a client can ignore others' checks. */
  surface: string;
  sessionId: string;
  topic: string;
  /** Seconds until the next one is due, so a client can show a countdown. */
  nextInSeconds: number;
}

/** The outcome of answering a check. */
export interface CheckResult {
  correct: boolean | null;
  feedback: string;
  score: number | null;
  maxScore: number;
  degraded: boolean;
}

/**
 * Owns the recurring "are you actually learning?" check.
 *
 * Timing used to live in each client, and they all disagreed: the web page
 * waited 10 minutes, the editor 5 minutes of idle, the desktop agent and the
 * browser extension only fired on a context switch after 60 seconds of dwell.
 * With one shared session that meant four surfaces interrupting on four
 * different clocks, or — more often — nothing firing at all.
 *
 * Now the session row holds `nextCheckAt` and surfaces claim a due check with a
 * conditional update. Exactly one surface wins each round, so the learner is
 * asked once per interval no matter how many agents are running.
 */
@Injectable()
export class SessionCheckService {
  private readonly logger = new Logger(SessionCheckService.name);

  constructor(
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    @InjectRepository(LearningEventEntity)
    private readonly eventRepo: Repository<LearningEventEntity>,
    private readonly ai: AIService,
    private readonly grader: AnswerGraderService,
    private readonly mastery: MasteryService,
    private readonly concepts: ConceptResolverService,
  ) {}

  /** Set the first check due once a session begins. */
  scheduleFirst(session: LearningSessionEntity, now = new Date()): void {
    const interval = this.intervalOf(session);
    session.checkIntervalSeconds = interval;
    session.nextCheckAt = new Date(now.getTime() + interval * 1000);
  }

  /**
   * Claim a due check for this surface, if one is due.
   *
   * The claim is a conditional UPDATE on `nextCheckAt`: it only succeeds while
   * the row still shows a due time in the past. Two surfaces polling in the
   * same instant therefore cannot both win, which is what would otherwise fire
   * four popups for a single interval.
   */
  async claim(
    userId: string,
    session: LearningSessionEntity,
    surface: Surface,
    now = new Date(),
  ): Promise<SessionCheck | null> {
    if (session.status !== 'active') return null;

    const interval = this.intervalOf(session);

    // No schedule yet (session predates this feature, or was just created).
    if (!session.nextCheckAt) {
      await this.sessionRepo.update(
        { id: session.id },
        { checkIntervalSeconds: interval, nextCheckAt: new Date(now.getTime() + interval * 1000) },
      );
      return null;
    }

    if (session.nextCheckAt.getTime() > now.getTime()) return null;

    const claimed = await this.sessionRepo.update(
      { id: session.id, status: 'active', nextCheckAt: LessThanOrEqual(now) },
      {
        nextCheckAt: new Date(now.getTime() + interval * 1000),
        lastCheckAt: now,
        checkCount: (session.checkCount ?? 0) + 1,
      },
    );

    // Another surface got there first this round.
    if (!claimed.affected) return null;

    const question = await this.generate(userId, session, surface);
    this.logger.log(
      `Check ${question.id} issued to ${surface} for session ${session.id} (every ${interval}s)`,
    );
    return question;
  }

  /**
   * Build one question and persist it so the answer can be graded against it.
   *
   * The question text has to be stored: without it the grader was judging
   * answers against the topic name alone.
   */
  async generate(
    userId: string,
    session: LearningSessionEntity,
    surface: Surface,
  ): Promise<SessionCheck> {
    const topic = session.topic;
    let generated: { id: string; question: string; type: string; expectedKeyPoints: string[] };

    try {
      const result = await this.ai.getProvider().complete({
        systemPrompt: `You are a learning assistant running a quick mid-session check.
Generate ONE short question about the given topic that:
- can be answered in one or two sentences
- tests understanding rather than recall of wording
- is specific enough that a vague answer would not pass

Return ONLY valid JSON:
{ "id": "chk_<random>", "question": "...", "type": "recall", "expectedKeyPoints": ["...", "..."] }`,
        messages: [{ role: 'user', content: `Topic: ${topic}\n\nGenerate one check question.` }],
        temperature: 0.8,
        responseFormat: 'json',
      });

      const parsed = JSON.parse(result.content);
      const question = String(parsed.question || '').trim();
      if (!question) throw new Error('no question');

      generated = {
        id: this.newId(parsed.id),
        question,
        type: String(parsed.type || 'recall'),
        expectedKeyPoints: Array.isArray(parsed.expectedKeyPoints)
          ? parsed.expectedKeyPoints.map(String)
          : [],
      };
    } catch {
      // A generation failure must not skip the check entirely, or the learner
      // could study for an hour unchallenged whenever the model is down.
      generated = {
        id: this.newId(),
        question: `In your own words, what is the main idea you have picked up about ${topic} so far?`,
        type: 'recall',
        expectedKeyPoints: [],
      };
    }

    await this.eventRepo.save(
      this.eventRepo.create({
        userId,
        sessionId: session.id,
        eventType: 'interval_quiz_shown',
        source: surface,
        topic,
        metadata: {
          quizId: generated.id,
          question: generated.question,
          expectedKeyPoints: generated.expectedKeyPoints,
          surface,
        },
      }),
    );

    return {
      id: generated.id,
      question: generated.question,
      type: generated.type,
      surface,
      sessionId: session.id,
      topic,
      nextInSeconds: this.intervalOf(session),
    };
  }

  /**
   * Grade an answer against the question that was actually asked.
   *
   * Looked up by check id. The previous implementation took the most recent
   * `interval_quiz_shown` row for the session, so once two surfaces could each
   * be issued a check, an answer to the older question was silently graded
   * against the newer one.
   */
  async answer(
    userId: string,
    checkId: string,
    answer: string,
    sessionId?: string,
  ): Promise<CheckResult> {
    const shown = await this.findShownEvent(userId, checkId, sessionId);
    if (!shown) throw new NotFoundException('That check was not found');

    const meta = (shown.metadata ?? {}) as Record<string, unknown>;
    const topic = shown.topic || 'this topic';
    const questionText =
      typeof meta.question === 'string' && meta.question
        ? meta.question
        : `A knowledge check about ${topic}`;
    const expectedKeyPoints = Array.isArray(meta.expectedKeyPoints)
      ? (meta.expectedKeyPoints as string[])
      : [];

    const result = await this.grader.grade({
      questions: [
        {
          id: checkId,
          text: questionText,
          type: 'recall',
          maxScore: DEFAULT_QUESTION_POINTS,
          expectedKeyPoints,
        },
      ],
      answers: [{ questionId: checkId, answer }],
      topic,
    });

    const graded = result.questions[0];
    // Unknown, not "correct". Defaulting to correct meant a grading outage told
    // every learner they were right.
    const correct = result.percentage === null ? null : result.percentage >= PASS_RATIO * 100;

    await this.eventRepo.save(
      this.eventRepo.create({
        userId,
        sessionId: shown.sessionId,
        eventType: 'interval_quiz_answered',
        source: shown.source,
        topic,
        metadata: { quizId: checkId, answer, correct, score: graded?.score ?? null },
      }),
    );

    if (result.percentage !== null) {
      const concept = await this.concepts.resolve(topic);
      if (concept) {
        await this.mastery.recordEvidence({
          userId,
          conceptId: concept.id,
          kind: 'interval_check',
          scoreFraction: result.percentage / 100,
          isReview: true,
        });
      }
    }

    return {
      correct,
      feedback: graded?.feedback || result.feedback,
      score: graded?.score ?? null,
      maxScore: graded?.maxScore ?? DEFAULT_QUESTION_POINTS,
      degraded: result.degraded,
    };
  }

  /**
   * Skipping still tells us something: the learner was interrupted and chose
   * not to answer. Recorded, but with no score, so it cannot move mastery.
   */
  async skip(userId: string, checkId: string, sessionId?: string): Promise<void> {
    const shown = await this.findShownEvent(userId, checkId, sessionId);
    if (!shown) return;

    await this.eventRepo.save(
      this.eventRepo.create({
        userId,
        sessionId: shown.sessionId,
        eventType: 'interval_quiz_skipped',
        source: shown.source,
        topic: shown.topic,
        metadata: { quizId: checkId },
      }),
    );
  }

  /** Find the issued check by id, scanning only this learner's own events. */
  private async findShownEvent(
    userId: string,
    checkId: string,
    sessionId?: string,
  ): Promise<LearningEventEntity | null> {
    const candidates = await this.eventRepo.find({
      where: {
        userId,
        eventType: 'interval_quiz_shown',
        ...(sessionId ? { sessionId } : {}),
      },
      order: { timestamp: 'DESC' },
      take: 200,
    });

    return (
      candidates.find(
        (e) => (e.metadata as Record<string, unknown> | null)?.quizId === checkId,
      ) ?? null
    );
  }

  private intervalOf(session: LearningSessionEntity): number {
    const configured = session.checkIntervalSeconds ?? DEFAULT_CHECK_INTERVAL_SECONDS;
    // Guard against a stored 0, which would busy-loop the popup.
    return Math.max(MIN_CHECK_INTERVAL_SECONDS, configured);
  }

  private newId(candidate?: unknown): string {
    const given = typeof candidate === 'string' ? candidate.trim() : '';
    // Always suffix: the mock provider returns a constant id, which would make
    // every check in a session collide on lookup.
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return given && given !== 'chk_<random>' ? `${given}_${suffix}` : `chk_${suffix}`;
  }
}
