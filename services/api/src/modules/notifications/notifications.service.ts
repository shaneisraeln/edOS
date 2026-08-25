import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../../entities/notification.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { MasteryService } from '../scoring/mastery.service';
import { MASTERY } from '../scoring/scoring.constants';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifRepo: Repository<NotificationEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    private readonly mastery: MasteryService,
  ) {}

  async getNotifications(userId: string, status?: string) {
    const where: any = { userId };
    if (status) where.status = status;
    return this.notifRepo.find({ where, order: { createdAt: 'DESC' }, take: 50 });
  }

  async getUnreadCount(userId: string) {
    const count = await this.notifRepo.count({ where: { userId, status: 'unread' } });
    return { count };
  }

  async markRead(userId: string, notificationId: string) {
    await this.notifRepo.update({ id: notificationId, userId }, { status: 'read' });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.notifRepo.update({ userId, status: 'unread' }, { status: 'read' });
    return { ok: true };
  }

  async create(userId: string, message: string, type: string, priority = 'normal', metadata?: Record<string, unknown>) {
    return this.notifRepo.save(
      this.notifRepo.create({ userId, message, type, priority, metadata }),
    );
  }

  /**
   * Generate revision reminders based on spaced repetition schedule.
   */
  async generateRevisionReminders(userId: string) {
    // Uses the one scheduled review time MasteryService maintains. This method
    // previously derived its own thresholds (14/7/3 days by mastery band), which
    // disagreed with the spaced-repetition schedule shown on the dashboard, so a
    // concept could be "due" in one place and not the other.
    const due = await this.mastery.getDueNodes(userId, 20);
    const now = Date.now();
    let created = 0;

    for (const node of due) {
      if (node.mastery >= MASTERY.MASTERED) continue;

      const existing = await this.notifRepo.findOne({
        where: { userId, type: 'revision', status: 'unread' },
      });
      if (existing) break;

      const overdueDays = node.nextReviewAt
        ? Math.floor((now - new Date(node.nextReviewAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      await this.create(
        userId,
        `"${node.concept?.name}" is due for review.`,
        'revision',
        overdueDays > (node.intervalDays || 1) ? 'high' : 'normal',
        { conceptId: node.conceptId, overdueDays },
      );
      created++;
    }

    // Streak check
    const lastSession = await this.sessionRepo.findOne({
      where: { userId },
      order: { startTime: 'DESC' },
    });
    if (lastSession) {
      const daysSinceSession = Math.floor((now - new Date(lastSession.startTime).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceSession >= 2) {
        await this.create(userId, `You haven't learned in ${daysSinceSession} days. Keep your streak alive!`, 'streak', 'high');
        created++;
      }
    }

    return { created };
  }
}
