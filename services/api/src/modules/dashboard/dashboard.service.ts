import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { LearningGoalEntity } from '../../entities/learning-goal.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(LearningGoalEntity)
    private readonly goalRepo: Repository<LearningGoalEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(AssessmentEntity)
    private readonly assessmentRepo: Repository<AssessmentEntity>,
  ) {}

  async getDashboard(userId: string) {
    const [user, goals, recentSessions, weakConcepts, strongConcepts, recentAssessments, stats] =
      await Promise.all([
        this.userRepo.findOne({ where: { id: userId } }),
        this.goalRepo.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 3 }),
        this.sessionRepo.find({ where: { userId }, order: { startTime: 'DESC' }, take: 5 }),
        this.nodeRepo.find({
          where: { userId },
          relations: ['concept'],
          order: { weaknessScore: 'DESC' },
          take: 5,
        }),
        this.nodeRepo.find({
          where: { userId },
          relations: ['concept'],
          order: { mastery: 'DESC' },
          take: 5,
        }),
        this.assessmentRepo.find({
          where: { userId },
          order: { generatedAt: 'DESC' },
          take: 5,
        }),
        this.computeStats(userId),
      ]);

    const { passwordHash, ...profile } = user || ({} as any);

    return {
      user: profile,
      currentGoal: goals[0] || null,
      goals,
      recentSessions,
      weakConcepts,
      strongConcepts,
      recentAssessments,
      stats,
    };
  }

  private async computeStats(userId: string) {
    const totalSessions = await this.sessionRepo.count({ where: { userId } });
    const totalAssessments = await this.assessmentRepo.count({ where: { userId } });
    const completedAssessments = await this.assessmentRepo.count({
      where: { userId, status: 'completed' },
    });

    // Calculate average mastery across all knowledge nodes
    const masteryResult = await this.nodeRepo
      .createQueryBuilder('node')
      .select('AVG(node.mastery)', 'avgMastery')
      .addSelect('COUNT(node.id)', 'conceptCount')
      .where('node.userId = :userId', { userId })
      .getRawOne();

    // Calculate total learning time (seconds)
    const timeResult = await this.sessionRepo
      .createQueryBuilder('session')
      .select('SUM(session.duration)', 'totalDuration')
      .where('session.userId = :userId', { userId })
      .andWhere('session.duration IS NOT NULL')
      .getRawOne();

    // Learning streak (consecutive days with sessions)
    const streak = await this.calculateStreak(userId);

    return {
      totalSessions,
      totalAssessments,
      completedAssessments,
      averageMastery: Math.round(parseFloat(masteryResult?.avgMastery || '0')),
      conceptCount: parseInt(masteryResult?.conceptCount || '0'),
      totalLearningMinutes: Math.round((parseInt(timeResult?.totalDuration || '0')) / 60),
      streak,
    };
  }

  private async calculateStreak(userId: string): Promise<number> {
    const sessions = await this.sessionRepo
      .createQueryBuilder('session')
      .select('DATE(session.startTime)', 'day')
      .where('session.userId = :userId', { userId })
      .groupBy('DATE(session.startTime)')
      .orderBy('day', 'DESC')
      .getRawMany();

    if (sessions.length === 0) return 0;

    let streak = 1;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(sessions[0].day);
    firstDay.setHours(0, 0, 0, 0);

    // If most recent session isn't today or yesterday, streak is 0
    const diffFromToday = Math.floor((today.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24));
    if (diffFromToday > 1) return 0;

    for (let i = 1; i < sessions.length; i++) {
      const prev = new Date(sessions[i - 1].day);
      const curr = new Date(sessions[i].day);
      const diff = Math.floor((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
      if (diff === 1) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  async getMastery(userId: string) {
    const nodes = await this.nodeRepo.find({
      where: { userId },
      relations: ['concept'],
      order: { mastery: 'DESC' },
    });

    const avgMastery = nodes.length > 0
      ? Math.round(nodes.reduce((sum, n) => sum + n.mastery, 0) / nodes.length)
      : 0;

    return {
      overall: avgMastery,
      conceptCount: nodes.length,
      nodes,
    };
  }

  async getProgress(userId: string) {
    // Get sessions grouped by date for the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dailySessions = await this.sessionRepo
      .createQueryBuilder('session')
      .select('DATE(session.startTime)', 'date')
      .addSelect('COUNT(*)', 'sessionCount')
      .addSelect('SUM(session.duration)', 'totalDuration')
      .where('session.userId = :userId', { userId })
      .andWhere('session.startTime >= :since', { since: thirtyDaysAgo })
      .groupBy('DATE(session.startTime)')
      .orderBy('date', 'ASC')
      .getRawMany();

    const dailyAssessments = await this.assessmentRepo
      .createQueryBuilder('assessment')
      .select('DATE(assessment.generatedAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect('AVG(assessment.score)', 'avgScore')
      .where('assessment.userId = :userId', { userId })
      .andWhere('assessment.generatedAt >= :since', { since: thirtyDaysAgo })
      .andWhere('assessment.status = :status', { status: 'completed' })
      .groupBy('DATE(assessment.generatedAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return {
      dailySessions,
      dailyAssessments,
    };
  }
}
