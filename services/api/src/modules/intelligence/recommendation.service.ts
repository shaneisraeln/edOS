import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';

/**
 * Recommendation Agent — suggests next topics, revision, and learning paths.
 */
@Injectable()
export class RecommendationService {
  constructor(
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(ConceptEntity)
    private readonly conceptRepo: Repository<ConceptEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
  ) {}

  /**
   * Get personalized recommendations for a user.
   */
  async getRecommendations(userId: string) {
    const nodes = await this.nodeRepo.find({
      where: { userId },
      relations: ['concept'],
    });

    return {
      nextTopics: await this.suggestNextTopics(userId, nodes),
      revisionNeeded: this.getRevisionCandidates(nodes),
      learningVelocity: await this.calculateVelocity(userId),
    };
  }

  /**
   * Suggest next topics based on knowledge graph gaps.
   * Looks for concepts where prerequisites are strong but the concept itself is weak or unseen.
   */
  private async suggestNextTopics(userId: string, existingNodes: KnowledgeNodeEntity[]) {
    const knownConceptIds = existingNodes.map((n) => n.conceptId);

    // Find all concepts not yet tracked
    const allConcepts = await this.conceptRepo.find();
    const untracked = allConcepts.filter((c) => !knownConceptIds.includes(c.id));

    // For each untracked concept, check if its parent is already mastered
    const suggestions: { concept: string; reason: string }[] = [];

    for (const concept of untracked.slice(0, 20)) {
      if (concept.parentConceptId) {
        const parentNode = existingNodes.find((n) => n.conceptId === concept.parentConceptId);
        if (parentNode && parentNode.mastery >= 50) {
          suggestions.push({
            concept: concept.name,
            reason: `You're strong in ${parentNode.concept?.name || 'the parent topic'}`,
          });
        }
      }
    }

    // Also suggest strengthening weak areas
    const weakNodes = existingNodes
      .filter((n) => n.mastery < 40 && n.practiceCount < 3)
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3);

    for (const node of weakNodes) {
      suggestions.push({
        concept: node.concept?.name || 'Unknown',
        reason: 'Low mastery — more practice recommended',
      });
    }

    return suggestions.slice(0, 5);
  }

  /**
   * Get concepts that need revision (not revised in a while + not fully mastered).
   */
  private getRevisionCandidates(nodes: KnowledgeNodeEntity[]) {
    const now = new Date();
    return nodes
      .filter((n) => {
        if (n.mastery >= 90) return false; // Already mastered
        if (!n.lastRevision) return true; // Never revised
        const daysSince = (now.getTime() - new Date(n.lastRevision).getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 7; // Not revised in a week
      })
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 5)
      .map((n) => ({
        concept: n.concept?.name || 'Unknown',
        mastery: n.mastery,
        lastRevision: n.lastRevision,
      }));
  }

  /**
   * Calculate learning velocity (concepts mastered per week).
   */
  private async calculateVelocity(userId: string) {
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);

    const sessions = await this.sessionRepo.count({
      where: { userId },
    });

    const recentSessions = await this.sessionRepo
      .createQueryBuilder('session')
      .select('COUNT(*)', 'count')
      .where('session.userId = :userId', { userId })
      .andWhere('session.startTime >= :since', { since: fourWeeksAgo })
      .getRawOne();

    const weeklyRate = Math.round(parseInt(recentSessions?.count || '0') / 4);

    return {
      totalSessions: sessions,
      weeklyAverage: weeklyRate,
      trend: weeklyRate > 3 ? 'active' : weeklyRate > 0 ? 'moderate' : 'inactive',
    };
  }
}
