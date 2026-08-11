import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssessmentEntity } from '../../entities/assessment.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { AssessmentService } from './assessment.service';
import { AssessmentController } from './assessment.controller';
import { AIModule } from '../ai/ai.module';

@Module({
  imports: [TypeOrmModule.forFeature([AssessmentEntity, KnowledgeNodeEntity, ConceptEntity]), AIModule],
  controllers: [AssessmentController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
