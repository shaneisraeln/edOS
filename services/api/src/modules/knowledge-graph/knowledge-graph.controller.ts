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

  @Post('update')
  updateNode(
    @Req() req: any,
    @Body() body: { conceptId: string; confidence?: number; mastery?: number; assessmentScore?: number; weaknessScore?: number },
  ) {
    return this.graphService.updateNode(req.user.sub, body.conceptId, body);
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
