import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { AIService } from '../ai/ai.service';

@Injectable()
export class AssessmentService {
  constructor(
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
    private readonly aiService: AIService,
  ) {}

  async generate(
    userId: string,
    data: { topic: string; subtopic?: string; difficulty?: string; type?: string; questionCount?: number },
  ) {
    // Fetch user's weak and strong concepts for contextual generation
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
      .filter((n) => n.weaknessScore > 50)
      .map((n) => n.concept?.name)
      .filter(Boolean) as string[];
    const strongConcepts = strongNodes
      .filter((n) => n.mastery > 70)
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

    const assessment = this.assessmentRepo.create({
      userId,
      topic: data.topic,
      subtopic: data.subtopic,
      difficulty: data.difficulty || 'intermediate',
      type: data.type || 'mcq',
      questions,
      maxScore: questions.length * 20,
      status: 'pending',
    });

    return this.assessmentRepo.save(assessment);
  }

  async submit(userId: string, assessmentId: string, answers: { questionId: string; answer: string }[]) {
    const assessment = await this.assessmentRepo.findOne({
      where: { id: assessmentId, userId },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');

    // Score answers using AI
    const scoringResult = await this.aiService.scoreAssessment({
      questions: assessment.questions,
      answers,
      topic: assessment.topic,
    });

    assessment.score = scoringResult.totalScore;
    assessment.status = 'completed';
    assessment.completedAt = new Date();
    assessment.feedback = scoringResult.feedback;
    assessment.questions = scoringResult.scoredQuestions;

    const saved = await this.assessmentRepo.save(assessment);

    // Update knowledge graph based on assessment result
    await this.updateKnowledgeGraph(userId, assessment.topic, scoringResult.totalScore, assessment.maxScore);

    return saved;
  }

  private async updateKnowledgeGraph(userId: string, topic: string, score: number, maxScore: number) {
    // Find the concept matching this topic
    const concept = await this.conceptRepo.findOne({
      where: { name: topic },
    });

    if (!concept) return;

    const scorePercent = maxScore > 0 ? (score / maxScore) * 100 : 0;

    // Find or create the knowledge node
    let node = await this.nodeRepo.findOne({
      where: { userId, conceptId: concept.id },
    });

    if (!node) {
      node = this.nodeRepo.create({
        userId,
        conceptId: concept.id,
        confidence: scorePercent,
        mastery: scorePercent,
        assessmentScore: scorePercent,
        weaknessScore: Math.max(0, 100 - scorePercent),
        practiceCount: 1,
        lastRevision: new Date(),
        revisionCount: 1,
      });
    } else {
      // Weighted update: blend old mastery with new score (70% new, 30% history)
      node.mastery = Math.round(node.mastery * 0.3 + scorePercent * 0.7);
      node.confidence = Math.round(node.confidence * 0.3 + scorePercent * 0.7);
      node.assessmentScore = scorePercent;
      node.weaknessScore = Math.max(0, 100 - node.mastery);
      node.practiceCount += 1;
      node.lastRevision = new Date();
      node.revisionCount += 1;
    }

    await this.nodeRepo.save(node);
  }

  async getHistory(userId: string, limit = 20) {
    return this.assessmentRepo.find({
      where: { userId },
      order: { generatedAt: 'DESC' },
      take: limit,
    });
  }

  async getById(userId: string, assessmentId: string) {
    const assessment = await this.assessmentRepo.findOne({
      where: { id: assessmentId, userId },
    });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }
}
