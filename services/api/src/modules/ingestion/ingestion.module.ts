import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { KnowledgeGraphModule } from '../knowledge-graph/knowledge-graph.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LearningEventEntity, LearningSessionEntity]),
    KnowledgeGraphModule,
  ],
  controllers: [IngestionController],
  providers: [IngestionService],
  exports: [IngestionService],
})
export class IngestionModule {}
