import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { AIService } from '../ai/ai.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AnswerGraderService, stripAnswerKey } from '../scoring/answer-grader.service';
import { MasteryService } from '../scoring/mastery.service';
import { ConceptResolverService } from '../scoring/concept-resolver.service';
import { PASS_RATIO } from '../scoring/scoring.constants';
import { StoredQuestion } from '../scoring/scoring.types';

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
    private readonly grader: AnswerGraderService,
    private readonly mastery: MasteryService,
    private readonly concepts: ConceptResolverService,
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

    const questions = (assessment.questions || []) as StoredQuestion[];

    // Uses the shared grader instead of its own throwaway rubric. The old
    // version defaulted to { score: 10, correct: true } when the response could
    // not be parsed, i.e. it awarded half marks and called a wrong answer right.
    const result = await this.grader.grade({
      questions,
      answers: [{ questionId: questions[0]?.id ?? 'ch1', answer }],
      topic: assessment.topic,
    });

    assessment.score = result.totalScore;
    assessment.maxScore = result.gradableMaxScore || result.declaredMaxScore;
    assessment.status = 'completed';
    assessment.completedAt = new Date();
    assessment.feedback = result.feedback;
    await this.assessmentRepo.save(assessment);

    // Challenges never fed the knowledge graph at all, so the daily challenge
    // could not affect the weakness ranking that chose the next one.
    if (result.percentage !== null) {
      const concept = await this.concepts.resolve(assessment.topic);
      if (concept) {
        await this.mastery.recordEvidence({
          userId,
          conceptId: concept.id,
          kind: 'challenge',
          scoreFraction: result.percentage / 100,
          difficulty: assessment.difficulty,
          isReview: true,
        });
      }
    }

    return {
      score: result.totalScore,
      maxScore: assessment.maxScore,
      percentage: result.percentage === null ? null : Math.round(result.percentage),
      correct: result.percentage === null ? null : result.percentage >= PASS_RATIO * 100,
      feedback: result.feedback,
      degraded: result.degraded,
    };
  }

  async getPendingChallenge(userId: string) {
    const challenge = await this.assessmentRepo.findOne({
      where: { userId, type: 'challenge', status: 'pending' },
      order: { generatedAt: 'DESC' },
    });
    if (!challenge) return null;

    return {
      ...challenge,
      questions: stripAnswerKey((challenge.questions || []) as Record<string, unknown>[]),
    };
  }
}
