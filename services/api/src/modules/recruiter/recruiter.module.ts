import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecruiterController } from './recruiter.controller';
import { RecruiterService } from './recruiter.service';
import { UserEntity } from '../../entities/user.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { ProjectEntity } from '../../entities/project.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { ConceptEntity } from '../../entities/concept.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      KnowledgeNodeEntity,
      AssessmentEntity,
      ProjectEntity,
      LearningSessionEntity,
      ConceptEntity,
    ]),
  ],
  controllers: [RecruiterController],
  providers: [RecruiterService],
  exports: [RecruiterService],
})
export class RecruiterModule {}
