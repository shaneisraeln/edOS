import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningPathController } from './learning-path.controller';
import { LearningPathService } from './learning-path.service';
import { LearningPathEntity, PathNodeEntity } from '../../entities/learning-path.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { LearningGoalEntity } from '../../entities/learning-goal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LearningPathEntity, PathNodeEntity, AssessmentEntity,
      KnowledgeNodeEntity, KnowledgeEdgeEntity, ConceptEntity, LearningGoalEntity,
    ]),
  ],
  controllers: [LearningPathController],
  providers: [LearningPathService],
  exports: [LearningPathService],
})
export class LearningPathModule {}
