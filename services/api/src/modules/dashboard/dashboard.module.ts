import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { UserEntity } from '../../entities/user.entity';
import { LearningGoalEntity } from '../../entities/learning-goal.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      LearningGoalEntity,
      LearningSessionEntity,
      KnowledgeNodeEntity,
      AssessmentEntity,
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
