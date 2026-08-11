import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { AIService } from '../ai/ai.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

/**
 * Quick contextual challenges triggered during learning sessions.
 * Shorter than full assessments — single-question verifications.
 */
@Injectable()
export class ChallengesService {
  constructor(
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    private readonly aiService: AIService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async generateChallenge(userId: string, topic?: string) {
    // Pick topic from weak areas if not specified
    if (!topic) {
      const weakNode = await this.nodeRepo.findOne({
        where: { userId },
        relations: ['concept'],
        order: { weaknessScore: 'DESC' },
      });
      topic = weakNode?.concept?.name || 'General Knowledge';
    }

    const result = await this.aiService.getProvider().complete({
      systemPrompt: `You are a micro-assessment generator. Create a single quick challenge question that can be answered in 1-2 minutes. The question should test real understanding, not trivia.

Return ONLY valid JSON:
{
  "question": "the challenge question",
  "type": "explain | predict_output | fix_bug | connect_concepts",
  "expectedKeyPoints": ["key point 1", "key point 2"],
  "difficulty": "easy | medium | hard",
  "timeLimit": 120
}`,
      messages: [{ role: 'user', content: `Generate a quick challenge about: ${topic}` }],
      temperature: 0.8,
      responseFormat: 'json',
    });

    let challenge: any;
    try {
      challenge = JSON.parse(result.content);
    } catch {
      challenge = { question: `Explain the core concept of ${topic} in your own words.`, type: 'explain', expectedKeyPoints: [], difficulty: 'medium', timeLimit: 120 };
    }

    // Store as a mini-assessment
    const assessment = await this.assessmentRepo.save(
      this.assessmentRepo.create({
        userId,
        topic,
        difficulty: challenge.difficulty || 'medium',
        type: 'challenge',
        questions: [{ id: 'ch1', text: challenge.question, type: challenge.type, maxScore: 20, expectedKeyPoints: challenge.expectedKeyPoints }],
        maxScore: 20,
        status: 'pending',
      }),
    );

    const challengeData = { ...challenge, id: assessment.id, topic };

    // Push via WebSocket
    this.realtimeGateway.pushChallenge(userId, challengeData);

    return challengeData;
  }

  async submitAnswer(userId: string, challengeId: string, answer: string) {
    const assessment = await this.assessmentRepo.findOne({ where: { id: challengeId, userId } });
    if (!assessment) return { error: 'Challenge not found' };

    const question = assessment.questions[0] as any;

    const result = await this.aiService.getProvider().complete({
      systemPrompt: `Score this challenge answer briefly. Return JSON: { "score": 0-20, "correct": true/false, "feedback": "1 sentence" }`,
      messages: [{ role: 'user', content: `Q: ${question.text}\nA: ${answer}\nExpected key points: ${(question.expectedKeyPoints || []).join(', ')}` }],
      temperature: 0.3,
      responseFormat: 'json',
    });

    let scoring: any;
    try {
      scoring = JSON.parse(result.content);
    } catch {
      scoring = { score: 10, correct: true, feedback: 'Evaluated.' };
    }

    assessment.score = scoring.score;
    assessment.status = 'completed';
    assessment.completedAt = new Date();
    assessment.feedback = scoring.feedback;
    await this.assessmentRepo.save(assessment);

    return { score: scoring.score, correct: scoring.correct, feedback: scoring.feedback, maxScore: 20 };
  }

  async getPendingChallenge(userId: string) {
    return this.assessmentRepo.findOne({
      where: { userId, type: 'challenge', status: 'pending' },
      order: { generatedAt: 'DESC' },
    });
  }
}
