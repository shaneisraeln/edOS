import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollegeController } from './college.controller';
import { CollegeService } from './college.service';
import { UserEntity } from '../../entities/user.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { LearningGoalEntity } from '../../entities/learning-goal.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      KnowledgeNodeEntity,
      LearningSessionEntity,
      AssessmentEntity,
      LearningGoalEntity,
    ]),
  ],
  controllers: [CollegeController],
  providers: [CollegeService],
})
export class CollegeModule {}
