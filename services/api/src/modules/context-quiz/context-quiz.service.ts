import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { AIService } from '../ai/ai.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

interface ContextInput {
  context: string;
  source: string;
  url?: string;
  title?: string;
  timeSpent?: number;
  topics?: string[];
}

@Injectable()
export class ContextQuizService {
  private readonly logger = new Logger(ContextQuizService.name);

  constructor(
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
    private readonly aiService: AIService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Core flow: take learning context, extract concepts, generate quiz, push to user.
   */
  async generateFromContext(userId: string, input: ContextInput) {
    this.logger.log(`Generating quiz for user ${userId}: "${input.title}" (${input.timeSpent}s, source: ${input.source})`);

    // Use AI to understand what they were learning and generate questions
    const result = await this.aiService.getProvider().complete({
      systemPrompt: `You are an intelligent learning assessment system. A student just finished studying some content online. Your job is to:
1. Identify what key concepts they were learning based on the page title, URL, and any content provided
2. Generate 2-3 quick verification questions to test if they actually understood it

IMPORTANT RULES:
- ALWAYS generate questions if the content is remotely technical/educational (programming, science, math, engineering, design, etc.)
- Questions should be specific to the topic indicated by the title/URL
- Even if you only have a page title and URL, that's enough to generate relevant questions about that topic
- Mix question types: one conceptual explanation, one practical application
- Keep questions concise — this is a quick popup quiz, not an exam
- Only set isEducational to false if the content is clearly entertainment/social media (memes, celebrity news, etc.)

Return ONLY valid JSON:
{
  "detectedTopic": "main topic they were studying",
  "concepts": ["concept1", "concept2"],
  "questions": [
    {
      "id": "q1",
      "text": "question text based on what they were reading",
      "type": "explain",
      "maxScore": 20
    },
    {
      "id": "q2", 
      "text": "second question",
      "type": "apply",
      "maxScore": 20
    }
  ],
  "isEducational": true
}`,
      messages: [
        {
          role: 'user',
          content: `The student just finished studying this:

Title: ${input.title || 'Unknown'}
URL: ${input.url || 'N/A'}
Source: ${input.source}
Time spent: ${input.timeSpent ? Math.round(input.timeSpent / 60) + ' minutes' : 'a few minutes'}
${input.topics?.length ? `Detected topics: ${input.topics.join(', ')}` : ''}

${input.context ? `Page content:\n${input.context.substring(0, 3000)}` : ''}

Generate 2-3 quiz questions about this topic.`,
        },
      ],
      temperature: 0.7,
      responseFormat: 'json',
    });

    let parsed: any;
    try {
      parsed = JSON.parse(result.content);
    } catch {
      this.logger.warn('Failed to parse AI response for context quiz');
      return { skipped: true, reason: 'Could not parse AI response' };
    }

    this.logger.log(`AI response: isEducational=${parsed.isEducational}, questions=${parsed.questions?.length}`);

    // If AI says not educational AND there are no questions, skip
    if (parsed.isEducational === false && (!parsed.questions || parsed.questions.length === 0)) {
      return { skipped: true, reason: 'Content not educational' };
    }

    // If no questions were generated, create a fallback
    if (!parsed.questions || parsed.questions.length === 0) {
      const topic = parsed.detectedTopic || input.title || 'this topic';
      parsed.questions = [
        { id: 'q1', text: `Explain the main concept of ${topic} in your own words.`, type: 'explain', maxScore: 20 },
        { id: 'q2', text: `How would you apply what you learned about ${topic} in practice?`, type: 'apply', maxScore: 20 },
      ];
    }

    // Save as assessment
    const assessment = await this.assessmentRepo.save(
      this.assessmentRepo.create({
        userId,
        topic: parsed.detectedTopic || input.title || 'Learning Session',
        subtopic: parsed.concepts?.[0],
        difficulty: 'contextual',
        type: 'context_quiz',
        questions: parsed.questions,
        maxScore: parsed.questions.reduce((s: number, q: any) => s + (q.maxScore || 20), 0),
        status: 'pending',
      }),
    );

    this.logger.log(`Quiz created: ${assessment.id} with ${parsed.questions.length} questions`);

    // Update concept graph
    for (const conceptName of parsed.concepts || []) {
      let concept = await this.conceptRepo.findOne({ where: { name: conceptName } });
      if (!concept) {
        concept = await this.conceptRepo.save(this.conceptRepo.create({ name: conceptName }));
      }
      let node = await this.nodeRepo.findOne({ where: { userId, conceptId: concept.id } });
      if (!node) {
        node = this.nodeRepo.create({
          userId, conceptId: concept.id,
          confidence: 15, mastery: 5, weaknessScore: 75,
          practiceCount: 1, lastRevision: new Date(), revisionCount: 0,
        });
      } else {
        node.practiceCount += 1;
        node.lastRevision = new Date();
        node.confidence = Math.min(100, node.confidence + 3);
      }
      await this.nodeRepo.save(node);
    }

    // Push via WebSocket
    const quizPayload = {
      id: assessment.id,
      topic: parsed.detectedTopic || input.title,
      source: input.source,
      title: input.title,
      questions: parsed.questions,
      concepts: parsed.concepts || [],
      timeLimit: 180,
    };

    this.realtimeGateway.notifyUser(userId, 'context-quiz:ready', quizPayload);

    return quizPayload;
  }

  /**
   * Score submitted answers and update knowledge graph.
   */
  async submitAnswers(userId: string, quizId: string, answers: { questionId: string; answer: string }[]) {
    const assessment = await this.assessmentRepo.findOne({ where: { id: quizId, userId } });
    if (!assessment) return { error: 'Quiz not found' };
    if (assessment.status === 'completed') return { error: 'Already submitted' };

    const scoringResult = await this.aiService.scoreAssessment({
      questions: assessment.questions,
      answers,
      topic: assessment.topic,
    });

    assessment.score = scoringResult.totalScore;
    assessment.status = 'completed';
    assessment.completedAt = new Date();
    assessment.feedback = scoringResult.feedback;
    assessment.questions = scoringResult.scoredQuestions.length > 0
      ? scoringResult.scoredQuestions
      : assessment.questions;
    await this.assessmentRepo.save(assessment);

    // Update knowledge graph
    const scorePercent = assessment.maxScore > 0
      ? (scoringResult.totalScore / assessment.maxScore) * 100
      : 50;

    const concept = await this.conceptRepo.findOne({ where: { name: assessment.topic } });
    if (concept) {
      let node = await this.nodeRepo.findOne({ where: { userId, conceptId: concept.id } });
      if (node) {
        node.mastery = Math.round(node.mastery * 0.4 + scorePercent * 0.6);
        node.confidence = Math.round(node.confidence * 0.4 + scorePercent * 0.6);
        node.assessmentScore = scorePercent;
        node.weaknessScore = Math.max(0, 100 - node.mastery);
        node.revisionCount += 1;
        await this.nodeRepo.save(node);
      }
    }

    this.realtimeGateway.notifyUser(userId, 'context-quiz:result', {
      quizId, score: scoringResult.totalScore,
      maxScore: assessment.maxScore,
      percentage: Math.round(scorePercent),
      feedback: scoringResult.feedback,
    });

    return {
      score: scoringResult.totalScore,
      maxScore: assessment.maxScore,
      percentage: Math.round(scorePercent),
      feedback: scoringResult.feedback,
      scoredQuestions: scoringResult.scoredQuestions,
    };
  }

  async getPendingQuiz(userId: string) {
    return this.assessmentRepo.findOne({
      where: { userId, type: 'context_quiz', status: 'pending' },
      order: { generatedAt: 'DESC' },
    });
  }

  async skipQuiz(userId: string, quizId: string) {
    await this.assessmentRepo.update({ id: quizId, userId }, { status: 'skipped' });
    return { ok: true };
  }
}
