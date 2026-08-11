import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationEntity } from '../../entities/notification.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifRepo: Repository<NotificationEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly nodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
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
    const nodes = await this.nodeRepo.find({ where: { userId }, relations: ['concept'] });
    const now = new Date();
    let created = 0;

    for (const node of nodes) {
      if (!node.lastRevision || node.mastery >= 90) continue;

      const daysSince = Math.floor((now.getTime() - new Date(node.lastRevision).getTime()) / (1000 * 60 * 60 * 24));
      const threshold = node.mastery >= 70 ? 14 : node.mastery >= 40 ? 7 : 3;

      if (daysSince >= threshold) {
        // Check if we already sent a reminder recently
        const existing = await this.notifRepo.findOne({
          where: { userId, type: 'revision', status: 'unread' },
        });
        if (!existing) {
          await this.create(
            userId,
            `You haven't revised "${node.concept?.name}" in ${daysSince} days.`,
            'revision',
            daysSince > threshold * 2 ? 'high' : 'normal',
            { conceptId: node.conceptId, daysSince },
          );
          created++;
        }
      }
    }

    // Streak check
    const lastSession = await this.sessionRepo.findOne({
      where: { userId },
      order: { startTime: 'DESC' },
    });
    if (lastSession) {
      const daysSinceSession = Math.floor((now.getTime() - new Date(lastSession.startTime).getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceSession >= 2) {
        await this.create(userId, `You haven't learned in ${daysSinceSession} days. Keep your streak alive!`, 'streak', 'high');
        created++;
      }
    }

    return { created };
  }
}
