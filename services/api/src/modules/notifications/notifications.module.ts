import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationEntity } from '../../entities/notification.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';

@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity, KnowledgeNodeEntity, LearningSessionEntity])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
