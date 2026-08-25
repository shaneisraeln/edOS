import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { AIService } from '../ai/ai.service';
import {
  AnswerGraderService,
  stripAnswerKey,
} from '../scoring/answer-grader.service';
import { MasteryService } from '../scoring/mastery.service';
import { ConceptResolverService } from '../scoring/concept-resolver.service';
import { MASTERY, DEFAULT_QUESTION_POINTS } from '../scoring/scoring.constants';
import { StoredQuestion } from '../scoring/scoring.types';

@Injectable()
export class AssessmentService {
  constructor(
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    private readonly aiService: AIService,
    private readonly grader: AnswerGraderService,
    private readonly mastery: MasteryService,
    private readonly concepts: ConceptResolverService,
  ) {}

  async generate(
    userId: string,
    data: { topic: string; subtopic?: string; difficulty?: string; type?: string; questionCount?: number },
  ) {
    const weakNodes = await this.nodeRepo.find({
      where: { userId },
      relations: ['concept'],
      order: { weaknessScore: 'DESC' },
      take: 5,
    });
    const strongNodes = await this.nodeRepo.find({
      where: { userId },
      relations: ['concept'],
      order: { mastery: 'DESC' },
      take: 5,
    });

    const weakConcepts = weakNodes
      .filter((n) => n.mastery < MASTERY.WEAK)
      .map((n) => n.concept?.name)
      .filter(Boolean) as string[];
    const strongConcepts = strongNodes
      .filter((n) => n.mastery >= MASTERY.STRONG)
      .map((n) => n.concept?.name)
      .filter(Boolean) as string[];

    const questions = await this.aiService.generateAssessment({
      topic: data.topic,
      subtopic: data.subtopic,
      difficulty: data.difficulty || 'intermediate',
      type: data.type || 'mcq',
      questionCount: data.questionCount || 5,
      weakConcepts,
      strongConcepts,
    });

    const assessment = await this.assessmentRepo.save(
      this.assessmentRepo.create({
        userId,
        topic: data.topic,
        subtopic: data.subtopic,
        difficulty: data.difficulty || 'intermediate',
        type: data.type || 'mcq',
        questions,
        maxScore: this.declaredMax(questions as StoredQuestion[]),
        status: 'pending',
      }),
    );

    // Answer keys stay on the server.
    return this.forClient(assessment);
  }

  async submit(
    userId: string,
    assessmentId: string,
    answers: { questionId: string; answer: string }[],
  ) {
    const assessment = await this.assessmentRepo.findOne({
      where: { id: assessmentId, userId },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

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

    // Merge the grade onto each question instead of replacing the array. The
    // previous implementation assigned the grader's output directly, so a
    // grader that returned nothing wiped the questions permanently.
    const gradeById = new Map(result.questions.map((q) => [q.questionId, q]));
    assessment.questions = questions.map((q) => {
      const grade = gradeById.get(q.id);
      if (!grade) return q;

      return {
        ...q,
        score: grade.score,
        feedback: grade.feedback,
        correct: grade.correct,
        // Carried through so a client can distinguish a deterministic mark from
        // a model judgement, and above all show an unscored question as
        // unscored rather than as a silent zero.
        gradeMethod: grade.method,
      };
    });

    const saved = await this.assessmentRepo.save(assessment);

    // Only record evidence when something was actually gradable.
    if (result.percentage !== null) {
      const concept = await this.concepts.resolve(assessment.topic);
      if (concept) {
        await this.mastery.recordEvidence({
          userId,
          conceptId: concept.id,
          kind: 'assessment',
          scoreFraction: result.percentage / 100,
          difficulty: assessment.difficulty,
          isReview: true,
        });
      }
    }

    return {
      ...this.forClient(saved),
      percentage: result.percentage,
      degraded: result.degraded,
    };
  }

  async getHistory(userId: string, limit = 20) {
    const rows = await this.assessmentRepo.find({
      where: { userId },
      order: { generatedAt: 'DESC' },
      take: limit,
    });
    return rows.map((row) => this.forClient(row));
  }

  async getById(userId: string, assessmentId: string) {
    const assessment = await this.assessmentRepo.findOne({
      where: { id: assessmentId, userId },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return this.forClient(assessment);
  }

  /** Never let answer keys or expected key points reach the client. */
  private forClient(assessment: AssessmentEntity): AssessmentEntity {
    return {
      ...assessment,
      questions: stripAnswerKey((assessment.questions || []) as Record<string, unknown>[]),
    } as AssessmentEntity;
  }

  private declaredMax(questions: StoredQuestion[]): number {
    if (!questions?.length) return 0;
    return questions.reduce((sum, q) => {
      const points = Number(q?.maxScore);
      return sum + (Number.isFinite(points) && points > 0 ? points : DEFAULT_QUESTION_POINTS);
    }, 0);
  }
}
