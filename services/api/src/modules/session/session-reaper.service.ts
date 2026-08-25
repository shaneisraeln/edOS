import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionService } from './session.service';

/**
 * Closes sessions that nothing has reported to for a while.
 *
 * Needed because agents can die without leaving: a crashed desktop agent used
 * to leave an 'active' session behind forever, and because ingestion attaches
 * events to the newest active session, every later event was filed under a
 * session the learner thought had finished hours ago.
 */
@Injectable()
export class SessionReaperService {
  private readonly logger = new Logger(SessionReaperService.name);

  constructor(private readonly sessions: SessionService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async reap(): Promise<void> {
    try {
      const closed = await this.sessions.reapAbandoned();
      if (closed > 0) this.logger.log(`Closed ${closed} abandoned session(s)`);
    } catch (err: any) {
      this.logger.error(`Session reaper failed: ${err?.message}`);
    }
  }
}
