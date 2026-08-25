import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { SessionParticipantEntity } from '../../entities/session-participant.entity';
import { PermissionEntity } from '../../entities/permission.entity';
import { DeviceEntity } from '../../entities/device.entity';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { SessionReaperService } from './session-reaper.service';
import { SessionCheckService } from './session-check.service';

/**
 * Global because ingestion, learning and the agents all need to resolve the
 * current session, and having one owner for that is the entire point.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      LearningSessionEntity,
      LearningEventEntity,
      SessionParticipantEntity,
      PermissionEntity,
      DeviceEntity,
    ]),
  ],
  controllers: [SessionController],
  providers: [SessionService, SessionReaperService, SessionCheckService],
  exports: [SessionService, SessionCheckService],
})
export class SessionModule {}
