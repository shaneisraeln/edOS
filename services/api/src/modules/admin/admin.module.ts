import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { UserEntity } from '../../entities/user.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';
import { AuditLogEntity } from '../../entities/audit-log.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      ConceptEntity,
      KnowledgeEdgeEntity,
      AuditLogEntity,
      LearningSessionEntity,
      AssessmentEntity,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
