import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { AIService } from '../ai/ai.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { AnswerGraderService, stripAnswerKey } from '../scoring/answer-grader.service';
import { MasteryService } from '../scoring/mastery.service';
import { ConceptResolverService } from '../scoring/concept-resolver.service';
import { StoredQuestion } from '../scoring/scoring.types';

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
    private readonly grader: AnswerGraderService,
    private readonly mastery: MasteryService,
    private readonly concepts: ConceptResolverService,
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

    // Note the concepts as seen. Generating a quiz is not evidence of knowing
    // anything, so this records exposure only — the real signal arrives when the
    // answers come back in submitAnswers().
    for (const conceptName of parsed.concepts || []) {
      const concept = await this.concepts.resolve(conceptName);
      if (concept) {
        await this.mastery.recordEvidence({
          userId,
          conceptId: concept.id,
          kind: 'exposure',
          isReview: false,
        });
      }
    }

    // Push via WebSocket
    const quizPayload = {
      id: assessment.id,
      topic: parsed.detectedTopic || input.title,
      source: input.source,
      title: input.title,
      questions: stripAnswerKey(parsed.questions as Record<string, unknown>[]),
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

    const questions = (assessment.questions || []) as StoredQuestion[];

    const result = await this.grader.grade({
      questions,
      answers,
      topic: assessment.topic,
    });

    assessment.score = result.totalScore;
    assessment.maxScore = result.gradableMaxScore || result.declaredMaxScore;
    assessment.status = 'completed';
    assessment.completedAt = new Date();
    assessment.feedback = result.feedback;

    // Merge grades onto the stored questions rather than replacing them.
    const gradeById = new Map(result.questions.map((q) => [q.questionId, q]));
    assessment.questions = questions.map((q) => {
      const grade = gradeById.get(q.id);
      return grade ? { ...q, score: grade.score, feedback: grade.feedback, correct: grade.correct } : q;
    });

    await this.assessmentRepo.save(assessment);

    // Only move mastery when something was gradable. The old code fell back to
    // an arbitrary 50% when maxScore was 0, inventing a score from nothing.
    if (result.percentage !== null) {
      const concept = await this.concepts.resolve(assessment.topic);
      if (concept) {
        await this.mastery.recordEvidence({
          userId,
          conceptId: concept.id,
          kind: 'context_quiz',
          scoreFraction: result.percentage / 100,
          difficulty: assessment.difficulty,
          isReview: true,
        });
      }
    }

    const payload = {
      quizId,
      score: result.totalScore,
      maxScore: assessment.maxScore,
      percentage: result.percentage === null ? null : Math.round(result.percentage),
      feedback: result.feedback,
      degraded: result.degraded,
    };

    this.realtimeGateway.notifyUser(userId, 'context-quiz:result', payload);

    return { ...payload, scoredQuestions: result.questions };
  }

  async getPendingQuiz(userId: string) {
    const quiz = await this.assessmentRepo.findOne({
      where: { userId, type: 'context_quiz', status: 'pending' },
      order: { generatedAt: 'DESC' },
    });
    if (!quiz) return null;

    return {
      ...quiz,
      questions: stripAnswerKey((quiz.questions || []) as Record<string, unknown>[]),
    };
  }

  async skipQuiz(userId: string, quizId: string) {
    await this.assessmentRepo.update({ id: quizId, userId }, { status: 'skipped' });
    return { ok: true };
  }
}
