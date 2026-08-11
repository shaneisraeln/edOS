import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { MemoryService } from './memory.service';
import { RecommendationService } from './recommendation.service';
import { DecayCronService } from './decay-cron.service';
import { InterviewService } from './interview.service';
import { IntelligenceController } from './intelligence.controller';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { UserEntity } from '../../entities/user.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      KnowledgeNodeEntity,
      LearningSessionEntity,
      AssessmentEntity,
      LearningEventEntity,
      ConceptEntity,
      UserEntity,
    ]),
  ],
  controllers: [IntelligenceController],
  providers: [MemoryService, RecommendationService, DecayCronService, InterviewService],
  exports: [MemoryService, RecommendationService, InterviewService],
})
export class IntelligenceModule {}
