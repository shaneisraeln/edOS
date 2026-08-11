import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MentorController } from './mentor.controller';
import { MentorService } from './mentor.service';
import { ChatMessageEntity } from '../../entities/chat-message.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ChatMessageEntity, KnowledgeNodeEntity, LearningSessionEntity]),
  ],
  controllers: [MentorController],
  providers: [MentorService],
  exports: [MentorService],
})
export class MentorModule {}
