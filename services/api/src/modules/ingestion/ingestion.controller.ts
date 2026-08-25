import { Controller, Post, Body, UseGuards, Req, HttpCode } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IngestionService } from './ingestion.service';

/**
 * Event Ingestion API
 * Accepts batch learning events from Desktop Agent, Browser Extension, VS Code Extension.
 * Events are processed asynchronously to build learning context.
 */
@Controller('ingest')
@UseGuards(JwtAuthGuard)
export class IngestionController {
  constructor(private readonly ingestionService: IngestionService) {}

  @Post('events')
  @HttpCode(202)
  async ingestEvents(
    @Req() req: any,
    @Body() body: { events: IngestEventDto[] },
  ) {
    const result = await this.ingestionService.ingestBatch(req.user.sub, body.events);
    // sessionId is passed through so an agent can confirm what its events were
    // attributed to, and notice when they were not attributed at all.
    return { accepted: result.accepted, errors: result.errors, sessionId: result.sessionId };
  }

  @Post('session/heartbeat')
  @HttpCode(200)
  async sessionHeartbeat(
    @Req() req: any,
    @Body() body: { sessionId: string; activeTopic?: string; confidence?: number },
  ) {
    return this.ingestionService.heartbeat(req.user.sub, body);
  }

  @Post('context')
  @HttpCode(200)
  async submitContext(
    @Req() req: any,
    @Body() body: { text: string; source: string; url?: string },
  ) {
    return this.ingestionService.processContext(req.user.sub, body);
  }
}

export interface IngestEventDto {
  eventType: string;
  source: string;
  timestamp?: string;
  topic?: string;
  metadata?: Record<string, unknown>;
  sessionId?: string;
}
