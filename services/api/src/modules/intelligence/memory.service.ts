import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { MasteryService } from '../scoring/mastery.service';
import { MASTERY } from '../scoring/scoring.constants';

/**
 * Memory Engine — short, medium and long-term views of what a learner knows.
 *
 * Decay and scheduling used to live here with their own constants. They now
 * delegate to MasteryService so there is exactly one forgetting curve and one
 * review schedule in the system.
 */
@Injectable()
export class MemoryService {
  constructor(
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
    @InjectRepository(LearningEventEntity)
    private readonly eventRepo: Repository<LearningEventEntity>,
    private readonly masteryService: MasteryService,
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
   * Recompute retention-adjusted mastery for a user's concepts.
   *
   * Delegates to MasteryService, which owns the forgetting curve. This used to
   * apply its own decay formula that only touched `confidence` — mastery itself
   * never decayed, so a concept studied once a year ago still read as mastered.
   */
  async applyDecay(userId: string) {
    const total = await this.masteryService.refreshRetention(userId);
    return { decayed: total, total };
  }

  /**
   * Concepts due for review, most overdue first.
   *
   * Reads the per-concept `nextReviewAt` that MasteryService maintains with
   * SM-2 scheduling, rather than recomputing an interval from mastery and
   * practice count. That older heuristic ignored whether the learner actually
   * got the answers right, and disagreed with the schedule the notifications
   * service used for the same concept.
   */
  async getRevisionSchedule(userId: string, limit = 10) {
    const due = await this.masteryService.getDueNodes(userId, limit);
    const now = Date.now();

    return due.map((node) => {
      const daysSinceRevision = node.lastRevision
        ? Math.floor((now - new Date(node.lastRevision).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const overdueDays = node.nextReviewAt
        ? Math.max(0, (now - new Date(node.nextReviewAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      const interval = node.intervalDays || 1;

      return {
        concept: node.concept?.name,
        conceptId: node.conceptId,
        mastery: Math.round(node.mastery),
        daysSinceRevision,
        idealInterval: Math.round(interval),
        dueAt: node.nextReviewAt,
        urgency: Math.round((overdueDays / interval) * 100) / 100,
      };
    });
  }
}
