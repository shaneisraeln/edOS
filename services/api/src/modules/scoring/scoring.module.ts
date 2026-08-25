import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { ConceptEntity } from '../../entities/concept.entity';
import { AIModule } from '../ai/ai.module';
import { AnswerGraderService } from './answer-grader.service';
import { MasteryService } from './mastery.service';
import { ConceptResolverService } from './concept-resolver.service';

/**
 * Grading and mastery. Global because nearly every feature module records
 * evidence, and routing them all through one service is the point.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([KnowledgeNodeEntity, ConceptEntity]), AIModule],
  providers: [AnswerGraderService, MasteryService, ConceptResolverService],
  exports: [AnswerGraderService, MasteryService, ConceptResolverService],
})
export class ScoringModule {}
