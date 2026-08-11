import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ProjectsService } from './projects.service';

@Controller('project')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post('create')
  create(
    @Req() req: any,
    @Body() body: { title: string; description?: string; repository?: string; technologies?: string[]; curriculumId?: string },
  ) {
    return this.projectsService.create(req.user.sub, body);
  }

  @Post('submit')
  submit(@Req() req: any, @Body() body: { projectId: string; notes?: string }) {
    return this.projectsService.submit(req.user.sub, body.projectId, body.notes);
  }

  @Get('history')
  getHistory(@Req() req: any, @Query('limit') limit?: string) {
    return this.projectsService.getHistory(req.user.sub, limit ? parseInt(limit) : 20);
  }

  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.projectsService.getById(req.user.sub, id);
  }
}
