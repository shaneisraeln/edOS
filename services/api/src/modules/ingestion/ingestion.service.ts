import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LearningEventEntity } from '../../entities/learning-event.entity';
import { LearningSessionEntity } from '../../entities/learning-session.entity';
import { AIService } from '../ai/ai.service';
import { KnowledgeGraphService } from '../knowledge-graph/knowledge-graph.service';
import { SessionService } from '../session/session.service';
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
    private readonly sessions: SessionService,
  ) {}

  async ingestBatch(userId: string, events: IngestEventDto[]) {
    const errors: string[] = [];
    let accepted = 0;

    // Attach to the learner's shared session if one is running.
    //
    // This no longer invents a session. Auto-creating one meant a stray event
    // from a background agent silently opened a session the learner never
    // started, and because the lookup was "newest active session wins", later
    // events from other surfaces were filed under it too. Events without a
    // session are still stored — they just are not attributed to a study
    // session that does not exist.
    const active = await this.sessions.findActive(userId);
    const sessionId = active?.id ?? null;

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

    // Credit each surface for what it contributed, so the session UI can show
    // which agents are actually producing signal rather than merely connected.
    if (sessionId && accepted > 0) {
      const perSurface = new Map<string, number>();
      for (const event of events) {
        if (!event.source) continue;
        perSurface.set(event.source, (perSurface.get(event.source) ?? 0) + 1);
      }
      for (const [surface, count] of perSurface) {
        await this.sessions.recordSurfaceActivity(sessionId, surface, count);
      }
    }

    // Trigger async context processing if enough events accumulated
    if (sessionId && accepted >= 3) {
      this.processEventsAsync(userId, sessionId).catch((err) =>
        this.logger.error(`Async processing failed: ${err.message}`),
      );
    }

    return { accepted, errors, sessionId };
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
