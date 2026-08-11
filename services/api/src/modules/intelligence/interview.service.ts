import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';

export interface InterviewReadiness {
  overallScore: number;
  strongTopics: string[];
  weakTopics: string[];
  recommendations: string[];
  estimatedPrepTime: string;
}

@Injectable()
export class InterviewService {
  constructor(
    @InjectRepository(KnowledgeNodeEntity)
    private readonly knowledgeNodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
  ) {}

  async getReadiness(userId: string): Promise<InterviewReadiness> {
    const nodes = await this.knowledgeNodeRepo.find({
      where: { userId },
      relations: ['concept'],
    });

    // Get recent assessments (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentAssessments = await this.assessmentRepo.find({
      where: { userId, generatedAt: MoreThan(thirtyDaysAgo) },
    });

    // Count projects via a raw approach (we don't have ProjectEntity in this module)
    // We'll base it on node data and assessments
    const totalNodes = nodes.length;

    // Calculate mastery distribution score (0-25 points)
    const avgMastery = totalNodes > 0
      ? nodes.reduce((sum, n) => sum + n.mastery, 0) / totalNodes
      : 0;
    const masteryScore = Math.min(25, (avgMastery / 100) * 25);

    // Weak areas penalty (0-25 points, fewer weak = better)
    const weakNodes = nodes.filter((n) => n.mastery < 50);
    const weakRatio = totalNodes > 0 ? weakNodes.length / totalNodes : 1;
    const weakAreasScore = Math.max(0, 25 * (1 - weakRatio));

    // Assessment frequency score (0-25 points)
    const assessmentFrequencyScore = Math.min(25, recentAssessments.length * 3);

    // Knowledge breadth score (0-25 points)
    const breadthScore = Math.min(25, totalNodes * 2.5);

    const overallScore = Math.round(masteryScore + weakAreasScore + assessmentFrequencyScore + breadthScore);

    // Strong topics (mastery > 70%)
    const strongTopics = nodes
      .filter((n) => n.mastery > 70)
      .sort((a, b) => b.mastery - a.mastery)
      .slice(0, 10)
      .map((n) => n.concept?.name || 'Unknown');

    // Weak topics (mastery < 50%)
    const weakTopics = weakNodes
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 10)
      .map((n) => n.concept?.name || 'Unknown');

    // Generate recommendations
    const recommendations: string[] = [];
    if (avgMastery < 60) {
      recommendations.push('Focus on deepening your understanding of core concepts before interviews.');
    }
    if (weakNodes.length > 3) {
      recommendations.push(`Review your ${weakNodes.length} weak areas: ${weakTopics.slice(0, 3).join(', ')}.`);
    }
    if (recentAssessments.length < 3) {
      recommendations.push('Take more practice assessments to build confidence and identify gaps.');
    }
    if (totalNodes < 5) {
      recommendations.push('Expand your knowledge graph by studying more topics.');
    }
    if (strongTopics.length > 0 && overallScore > 60) {
      recommendations.push(`Highlight your strengths in: ${strongTopics.slice(0, 3).join(', ')}.`);
    }
    if (recommendations.length === 0) {
      recommendations.push('You are well-prepared! Keep practicing to maintain your edge.');
    }

    // Estimate prep time
    const hoursNeeded = Math.max(0, Math.round((100 - overallScore) * 0.5));
    const estimatedPrepTime = hoursNeeded <= 0
      ? 'Ready now'
      : hoursNeeded < 10
        ? `${hoursNeeded} hours`
        : `${Math.round(hoursNeeded / 5)} days (${hoursNeeded} hours)`;

    return {
      overallScore: Math.min(100, Math.max(0, overallScore)),
      strongTopics,
      weakTopics,
      recommendations,
      estimatedPrepTime,
    };
  }
}
