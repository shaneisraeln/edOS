import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { SessionService } from '../session/session.service';
import { SessionCheckService } from '../session/session-check.service';
import { Surface } from '../session/session.constants';

/**
 * Which surface a session belongs to. Interval-quiz events used to hardcode
 * 'web', which misattributed checks once other surfaces could trigger them.
 */
function sourceOf(session: LearningSessionEntity): string {
  const surface = (session as unknown as { initiatedBy?: string }).initiatedBy;
  return surface || 'web';
}

@Injectable()
export class LearningService {
  constructor(
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    @InjectRepository(LearningEventEntity)
    private readonly eventRepo: Repository<LearningEventEntity>,
    private readonly sessions: SessionService,
    private readonly checks: SessionCheckService,
  ) {}

  /**
   * Legacy start endpoint, kept so already-installed agents keep working.
   *
   * It now delegates to SessionService rather than minting its own row. Any
   * surface still calling this joins the shared session instead of creating a
   * competing one, which is what produced three concurrent "active" sessions.
   */
  async startSession(
    userId: string,
    data: { topic: string; subtopic?: string; surface?: string },
  ) {
    const { session } = await this.sessions.start(userId, {
      topic: data.topic,
      subtopic: data.subtopic,
      surface: data.surface,
    });

    // Shaped like the old response (callers read `.id`), with the session view
    // attached for clients that understand it.
    const entity = await this.sessionRepo.findOne({ where: { id: session.id } });
    return { ...entity, session };
  }

  async endSession(userId: string, sessionId: string, confidence?: number) {
    // Ends it for every participating surface, not just the caller.
    return this.sessions.end(userId, { sessionId, confidence });
  }

  async getHistory(userId: string, limit = 20) {
    return this.sessionRepo.find({
      where: { userId },
      order: { startTime: 'DESC' },
      take: limit,
    });
  }

  async recordEvent(
    userId: string,
    data: {
      sessionId: string;
      eventType: string;
      source: string;
      topic?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const event = this.eventRepo.create({
      userId,
      sessionId: data.sessionId,
      eventType: data.eventType,
      source: data.source,
      topic: data.topic,
      metadata: data.metadata || {},
    });
    return this.eventRepo.save(event);
  }

  async getSessionEvents(userId: string, sessionId: string) {
    return this.eventRepo.find({
      where: { userId, sessionId },
      order: { timestamp: 'ASC' },
    });
  }

  /**
   * Generate a quick interval quiz question during an active session.
   * Returns a single question to check if the user is still engaged.
   */
  async generateIntervalQuiz(userId: string, sessionId: string, topic: string) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, userId, status: 'active' },
    });
    if (!session) throw new NotFoundException('Active session not found');

    // Delegates to the shared check service. This used to be a second, slightly
    // different implementation of question generation, so answers were graded
    // by rules that did not quite match how the question had been produced.
    if (topic?.trim() && topic.trim() !== session.topic) {
      session.topic = topic.trim();
    }

    return this.checks.generate(userId, session, sourceOf(session) as Surface);
  }

  /**
   * Score an interval quiz answer.
   */
  async scoreIntervalQuiz(
    userId: string,
    sessionId: string,
    quizId: string,
    answer: string,
  ) {
    // Grading lives in the shared check service, which looks the question up by
    // check id. This method previously took the newest `interval_quiz_shown`
    // row for the session, so once more than one surface could be issued a
    // check, an answer was graded against whichever question came last.
    return this.checks.answer(userId, quizId, answer, sessionId);
  }
}
