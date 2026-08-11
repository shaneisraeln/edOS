import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { AIService } from '../ai/ai.service';

@Injectable()
export class LearningService {
  constructor(
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    @InjectRepository(LearningEventEntity)
    private readonly eventRepo: Repository<LearningEventEntity>,
    private readonly aiService: AIService,
  ) {}

  async startSession(userId: string, data: { topic: string; subtopic?: string }) {
    const session = this.sessionRepo.create({
      userId,
      topic: data.topic,
      subtopic: data.subtopic,
      startTime: new Date(),
      status: 'active',
    });
    return this.sessionRepo.save(session);
  }

  async endSession(userId: string, sessionId: string, confidence?: number) {
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    session.endTime = new Date();
    session.status = 'completed';
    session.duration = Math.floor(
      (session.endTime.getTime() - session.startTime.getTime()) / 1000,
    );
    if (confidence !== undefined) session.confidence = confidence;

    return this.sessionRepo.save(session);
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

    const result = await this.aiService.getProvider().complete({
      systemPrompt: `You are a learning assistant. Generate ONE quick knowledge check question about the given topic. 
The question should:
- Be answerable in 1-2 sentences
- Test understanding, not memorization
- Be specific to the topic

Return ONLY valid JSON:
{ "id": "iq_<random>", "question": "your question", "type": "recall", "expectedAnswer": "brief expected answer" }`,
      messages: [
        { role: 'user', content: `Topic: ${topic}\n\nGenerate one quick check question.` },
      ],
      temperature: 0.8,
      responseFormat: 'json',
    });

    try {
      const parsed = JSON.parse(result.content);
      // Record the quiz event
      await this.eventRepo.save(this.eventRepo.create({
        userId,
        sessionId,
        eventType: 'interval_quiz_shown',
        source: 'web',
        topic,
        metadata: { quizId: parsed.id, question: parsed.question },
      }));
      return parsed;
    } catch {
      return {
        id: `iq_${Date.now()}`,
        question: `Explain what you've learned about ${topic} so far in your own words.`,
        type: 'recall',
      };
    }
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
    const session = await this.sessionRepo.findOne({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');

    const result = await this.aiService.getProvider().complete({
      systemPrompt: `You are scoring a quick learning check answer. The student is studying "${session.topic}".
Be encouraging but honest. Score whether they demonstrate understanding.
Return ONLY valid JSON: { "correct": true/false, "feedback": "1-2 sentence feedback" }`,
      messages: [
        { role: 'user', content: `Question context: A quiz about "${session.topic}"\nStudent answer: "${answer}"\n\nScore this.` },
      ],
      temperature: 0.3,
      responseFormat: 'json',
    });

    let scored = { correct: true, feedback: 'Good effort! Keep learning.' };
    try {
      scored = JSON.parse(result.content);
    } catch {}

    // Record the answer event
    await this.eventRepo.save(this.eventRepo.create({
      userId,
      sessionId,
      eventType: 'interval_quiz_answered',
      source: 'web',
      topic: session.topic,
      metadata: { quizId, answer, correct: scored.correct },
    }));

    return scored;
  }
}
