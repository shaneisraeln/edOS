import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { ConceptEntity } from '../../entities/concept.entity';
import { KnowledgeEdgeEntity } from '../../entities/knowledge-edge.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConceptEntity, KnowledgeEdgeEntity])],
  providers: [SeedService],
})
export class SeedModule {}
