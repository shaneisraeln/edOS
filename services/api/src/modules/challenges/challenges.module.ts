import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChallengesController } from './challenges.controller';
import { ChallengesService } from './challenges.service';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AssessmentEntity, KnowledgeNodeEntity])],
  controllers: [ChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
