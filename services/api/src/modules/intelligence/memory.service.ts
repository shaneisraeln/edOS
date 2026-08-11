import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { LearningEventEntity } from '../../entities/learning-event.entity';

/**
 * Memory Engine — manages short, medium, and long-term learner memory.
 * Also implements knowledge decay and spaced repetition scheduling.
 */
@Injectable()
export class MemoryService {
  // Decay rate: lose ~5% confidence per week of inactivity
  private readonly DECAY_RATE_PER_DAY = 0.007;
  // Minimum confidence floor
  private readonly MIN_CONFIDENCE = 5;

  constructor(
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
    @InjectRepository(LearningEventEntity)
    private readonly eventRepo: Repository<LearningEventEntity>,
  ) {}

  /**
   * Short-term memory: current session context (last few hours)
   */
  async getShortTermMemory(userId: string) {
    const hoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
    const recentEvents = await this.eventRepo.find({
      where: { userId, timestamp: MoreThan(hoursAgo) },
      order: { timestamp: 'DESC' },
      take: 50,
    });

    const activeSession = await this.sessionRepo.findOne({
      where: { userId, status: 'active' },
      order: { startTime: 'DESC' },
    });

    return {
      currentSession: activeSession,
      recentActivity: recentEvents.map((e) => ({
        type: e.eventType,
        source: e.source,
        topic: e.topic,
        timestamp: e.timestamp,
      })),
      activeTopic: activeSession?.topic || recentEvents[0]?.topic || null,
    };
  }

  /**
   * Medium-term memory: recent learning (last 2 weeks)
   */
  async getMediumTermMemory(userId: string) {
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const recentSessions = await this.sessionRepo.find({
      where: { userId, startTime: MoreThan(twoWeeksAgo) },
      order: { startTime: 'DESC' },
      take: 30,
    });

    const recentAssessments = await this.assessmentRepo.find({
      where: { userId, generatedAt: MoreThan(twoWeeksAgo) },
      order: { generatedAt: 'DESC' },
      take: 10,
    });

    // Topics studied recently
    const topicFrequency: Record<string, number> = {};
    for (const s of recentSessions) {
      topicFrequency[s.topic] = (topicFrequency[s.topic] || 0) + 1;
    }

    return {
      sessions: recentSessions,
      assessments: recentAssessments,
      topicFrequency: Object.entries(topicFrequency)
        .sort((a, b) => b[1] - a[1])
        .map(([topic, count]) => ({ topic, count })),
    };
  }

  /**
   * Long-term memory: full learner profile
   */
  async getLongTermMemory(userId: string) {
    const allNodes = await this.nodeRepo.find({
      where: { userId },
      relations: ['concept'],
      order: { mastery: 'DESC' },
    });

    const totalSessions = await this.sessionRepo.count({ where: { userId } });
    const totalAssessments = await this.assessmentRepo.count({ where: { userId } });

    return {
      knowledgeNodes: allNodes,
      totalSessions,
      totalAssessments,
      strengths: allNodes.filter((n) => n.mastery >= 70).map((n) => n.concept?.name),
      weaknesses: allNodes.filter((n) => n.weaknessScore >= 60).map((n) => n.concept?.name),
      averageMastery:
        allNodes.length > 0
          ? Math.round(allNodes.reduce((s, n) => s + n.mastery, 0) / allNodes.length)
          : 0,
    };
  }

  /**
   * Apply knowledge decay to all user nodes.
   * Called periodically or on dashboard load.
   */
  async applyDecay(userId: string) {
    const nodes = await this.nodeRepo.find({ where: { userId } });
    const now = new Date();
    let decayed = 0;

    for (const node of nodes) {
      if (!node.lastRevision) continue;

      const daysSinceRevision = Math.floor(
        (now.getTime() - new Date(node.lastRevision).getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysSinceRevision < 3) continue; // Grace period: no decay within 3 days

      // Exponential decay based on days since last revision
      const decayFactor = Math.pow(1 - this.DECAY_RATE_PER_DAY, daysSinceRevision - 3);
      const newConfidence = Math.max(this.MIN_CONFIDENCE, Math.round(node.confidence * decayFactor));

      if (newConfidence < node.confidence) {
        node.confidence = newConfidence;
        node.weaknessScore = Math.min(100, 100 - node.mastery + (100 - newConfidence) / 2);
        await this.nodeRepo.save(node);
        decayed++;
      }
    }

    return { decayed, total: nodes.length };
  }

  /**
   * Get revision schedule using spaced repetition logic.
   * Returns concepts due for revision sorted by urgency.
   */
  async getRevisionSchedule(userId: string, limit = 10) {
    const nodes = await this.nodeRepo.find({
      where: { userId },
      relations: ['concept'],
    });

    const now = new Date();
    const scored = nodes.map((node) => {
      const daysSinceRevision = node.lastRevision
        ? Math.floor((now.getTime() - new Date(node.lastRevision).getTime()) / (1000 * 60 * 60 * 24))
        : 999;

      // Spaced repetition interval based on mastery
      // Higher mastery = longer interval before revision needed
      const idealInterval = this.getIdealInterval(node.mastery, node.practiceCount);
      const overdue = daysSinceRevision - idealInterval;

      return {
        node,
        daysSinceRevision,
        idealInterval,
        overdue,
        urgency: overdue > 0 ? overdue / idealInterval : 0,
      };
    });

    // Sort by urgency (most overdue first)
    return scored
      .filter((s) => s.overdue > 0)
      .sort((a, b) => b.urgency - a.urgency)
      .slice(0, limit)
      .map((s) => ({
        concept: s.node.concept?.name,
        conceptId: s.node.conceptId,
        mastery: s.node.mastery,
        daysSinceRevision: s.daysSinceRevision,
        idealInterval: s.idealInterval,
        urgency: Math.round(s.urgency * 100) / 100,
      }));
  }

  /**
   * Spaced repetition interval calculation.
   * Based on SuperMemo SM-2 inspired logic.
   */
  private getIdealInterval(mastery: number, practiceCount: number): number {
    if (practiceCount <= 1) return 1;
    if (practiceCount === 2) return 3;

    // Base interval grows with practice count
    const baseInterval = Math.pow(2, Math.min(practiceCount - 1, 8));

    // Mastery multiplier: high mastery = longer intervals
    const masteryMultiplier = 0.5 + (mastery / 100) * 1.5;

    return Math.round(baseInterval * masteryMultiplier);
  }
}
