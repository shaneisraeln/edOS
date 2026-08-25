import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { KnowledgeGraphService } from './knowledge-graph.service';

@Controller('graph')
@UseGuards(JwtAuthGuard)
export class KnowledgeGraphController {
  constructor(private readonly graphService: KnowledgeGraphService) {}

  @Get()
  getGraph(@Req() req: any) {
    return this.graphService.getUserGraph(req.user.sub);
  }

  @Get('concepts')
  getConcepts() {
    return this.graphService.getConcepts();
  }

  /**
   * Record that the learner engaged with a concept.
   *
   * Deliberately accepts only a conceptId. Mastery, confidence and weakness are
   * derived from graded evidence server-side and are not settable by a client —
   * this endpoint previously wrote whatever numbers the caller sent.
   */
  @Post('update')
  recordInteraction(@Req() req: any, @Body() body: { conceptId: string }) {
    return this.graphService.recordInteraction(req.user.sub, body.conceptId);
  }

  @Post('concepts')
  createConcept(@Body() body: { name: string; description?: string; parentConceptId?: string; curriculumId?: string }) {
    return this.graphService.createConcept(body);
  }

  @Post('edges')
  createEdge(@Body() body: { parentConceptId: string; childConceptId: string; relationshipType?: string }) {
    return this.graphService.createEdge(body);
  }

  @Get('weak')
  getWeakConcepts(@Req() req: any, @Query('limit') limit?: string) {
    return this.graphService.getWeakConcepts(req.user.sub, limit ? parseInt(limit) : 10);
  }

  @Get('strong')
  getStrongConcepts(@Req() req: any, @Query('limit') limit?: string) {
    return this.graphService.getStrongConcepts(req.user.sub, limit ? parseInt(limit) : 10);
  }
}
