import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { LearningService } from './learning.service';
import { LearningController } from './learning.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LearningSessionEntity, LearningEventEntity])],
  controllers: [LearningController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
