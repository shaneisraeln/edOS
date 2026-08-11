import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContextQuizController } from './context-quiz.controller';
import { ContextQuizService } from './context-quiz.service';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { ConceptEntity } from '../../entities/concept.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AssessmentEntity, KnowledgeNodeEntity, ConceptEntity])],
  controllers: [ContextQuizController],
  providers: [ContextQuizService],
  exports: [ContextQuizService],
})
export class ContextQuizModule {}
