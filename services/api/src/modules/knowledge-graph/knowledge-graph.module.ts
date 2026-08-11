import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConceptEntity } from '../../entities/concept.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';
import { KnowledgeGraphService } from './knowledge-graph.service';
import { KnowledgeGraphController } from './knowledge-graph.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConceptEntity, KnowledgeNodeEntity, KnowledgeEdgeEntity]),
  ],
  controllers: [KnowledgeGraphController],
  providers: [KnowledgeGraphService],
  exports: [KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
