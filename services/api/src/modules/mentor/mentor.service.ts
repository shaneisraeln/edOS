import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessageEntity } from '../../entities/chat-message.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AIService } from '../ai/ai.service';

@Injectable()
export class MentorService {
  constructor(
    @InjectRepository(ChatMessageEntity)
    private readonly chatRepo: Repository<ChatMessageEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly knowledgeNodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    private readonly aiService: AIService,
  ) {}

  async chat(userId: string, message: string): Promise<{ reply: string }> {
    // Save the user message
    await this.chatRepo.save({
      userId,
      role: 'user',
      content: message,
    });

    // Get user context for the system prompt
    const context = await this.getUserContext(userId);

    // Get recent chat history for continuity
    const recentHistory = await this.chatRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 10,
    });

    const messages = recentHistory
      .reverse()
      .slice(0, -1) // exclude the message we just saved (it's the current user message)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    messages.push({ role: 'user', content: message });

    const provider = this.aiService.getProvider();
    const result = await provider.complete({
      systemPrompt: `You are an AI learning mentor for a student on a personalized learning platform. Your job is to help them understand concepts, answer questions, suggest learning strategies, and provide encouragement.

Here is what you know about this student:
${context}

Guidelines:
- Be concise and helpful
- Use examples and analogies when explaining concepts
- If the student is struggling with a weak area, be encouraging and break things down
- Suggest assessments or practice when appropriate
- Reference their recent learning activity when relevant`,
      messages,
      temperature: 0.7,
    });

    const reply = result.content;

    // Save the assistant reply
    await this.chatRepo.save({
      userId,
      role: 'assistant',
      content: reply,
    });

    return { reply };
  }

  async getHistory(userId: string): Promise<ChatMessageEntity[]> {
    return this.chatRepo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
      take: 50,
    });
  }

  private async getUserContext(userId: string): Promise<string> {
    const weakNodes = await this.knowledgeNodeRepo.find({
      where: { userId },
      relations: ['concept'],
      order: { mastery: 'ASC' },
      take: 5,
    });

    const recentSessions = await this.sessionRepo.find({
      where: { userId },
      order: { startTime: 'DESC' },
      take: 5,
    });

    const weakAreas = weakNodes
      .filter((n) => n.mastery < 50)
      .map((n) => `${n.concept?.name || 'Unknown'} (mastery: ${Math.round(n.mastery)}%)`)
      .join(', ');

    const recentTopics = recentSessions
      .map((s) => s.topic)
      .filter(Boolean)
      .join(', ');

    let context = '';
    if (weakAreas) context += `- Weak areas: ${weakAreas}\n`;
    if (recentTopics) context += `- Recently studying: ${recentTopics}\n`;
    if (!context) context = '- New learner, no history yet.\n';

    return context;
  }
}
