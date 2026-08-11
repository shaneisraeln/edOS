import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AIService } from '../ai/ai.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { IngestEventDto } from './ingestion.controller';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectRepository(LearningEventEntity)
    private readonly eventRepo: Repository<LearningEventEntity>,
    @InjectRepository(LearningSessionEntity)
    private readonly sessionRepo: Repository<LearningSessionEntity>,
    private readonly aiService: AIService,
    private readonly graphService: KnowledgeGraphService,
  ) {}

  async ingestBatch(userId: string, events: IngestEventDto[]) {
    const errors: string[] = [];
    let accepted = 0;

    // Ensure there's an active session (or create one)
    let sessionId = events[0]?.sessionId;
    if (!sessionId) {
      const activeSession = await this.sessionRepo.findOne({
        where: { userId, status: 'active' },
        order: { startTime: 'DESC' },
      });
      if (activeSession) {
        sessionId = activeSession.id;
      } else {
        // Auto-create a session from the first event
        const topic = events.find((e) => e.topic)?.topic || 'General Learning';
        const newSession = await this.sessionRepo.save(
          this.sessionRepo.create({
            userId,
            topic,
            startTime: new Date(),
            status: 'active',
          }),
        );
        sessionId = newSession.id;
      }
    }

    for (const event of events) {
      try {
        await this.eventRepo.save(
          this.eventRepo.create({
            userId,
            sessionId,
            eventType: event.eventType,
            source: event.source,
            topic: event.topic,
            metadata: event.metadata || {},
            timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
          }),
        );
        accepted++;
      } catch (err: any) {
        errors.push(`Event ${event.eventType}: ${err.message}`);
      }
    }

    // Trigger async context processing if enough events accumulated
    if (accepted >= 3) {
      this.processEventsAsync(userId, sessionId).catch((err) =>
        this.logger.error(`Async processing failed: ${err.message}`),
      );
    }

    return { accepted, errors };
  }

  async heartbeat(
    userId: string,
    data: { sessionId: string; activeTopic?: string; confidence?: number },
  ) {
    const session = await this.sessionRepo.findOne({
      where: { id: data.sessionId, userId },
    });
    if (!session) return { status: 'session_not_found' };

    if (data.activeTopic) session.topic = data.activeTopic;
    if (data.confidence !== undefined) session.confidence = data.confidence;
    await this.sessionRepo.save(session);

    return { status: 'ok', sessionId: session.id };
  }

  async processContext(
    userId: string,
    data: { text: string; source: string; url?: string },
  ) {
    // Use AI to extract concepts from the submitted context
    const extraction = await this.aiService.extractConcepts(data.text);

    // Update knowledge graph with detected concepts
    for (const conceptName of extraction.concepts) {
      const concept = await this.graphService.findOrCreateConcept(conceptName);
      // Touch the node (create if not exists, mark as encountered)
      await this.graphService.touchNode(userId, concept.id);
    }

    // Create edges for relationships
    for (const rel of extraction.relationships) {
      const parent = await this.graphService.findOrCreateConcept(rel.parent);
      const child = await this.graphService.findOrCreateConcept(rel.child);
      await this.graphService.ensureEdge(parent.id, child.id, rel.type);
    }

    return {
      concepts: extraction.concepts,
      relationships: extraction.relationships,
    };
  }

  private async processEventsAsync(userId: string, sessionId: string) {
    // Get recent events for this session
    const events = await this.eventRepo.find({
      where: { userId, sessionId },
      order: { timestamp: 'DESC' },
      take: 20,
    });

    if (events.length < 3) return;

    // Build a text summary of recent activity
    const activitySummary = events
      .map((e) => `[${e.source}] ${e.eventType}: ${e.topic || JSON.stringify(e.metadata)}`)
      .join('\n');

    // Extract concepts from the activity
    const extraction = await this.aiService.extractConcepts(activitySummary);

    // Update knowledge graph
    for (const conceptName of extraction.concepts) {
      const concept = await this.graphService.findOrCreateConcept(conceptName);
      await this.graphService.touchNode(userId, concept.id);
    }

    // Update session topic based on most detected concept
    if (extraction.concepts.length > 0) {
      const session = await this.sessionRepo.findOne({ where: { id: sessionId } });
      if (session) {
        session.topic = extraction.concepts[0];
        await this.sessionRepo.save(session);
      }
    }
  }
}
