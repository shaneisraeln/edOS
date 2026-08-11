import { Controller, Post, Get, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssessmentService } from './assessment.service';

@Controller('assessment')
@UseGuards(JwtAuthGuard)
export class AssessmentController {
  constructor(private readonly assessmentService: AssessmentService) {}

  @Post('generate')
  generate(
    @Req() req: any,
    @Body() body: { topic: string; subtopic?: string; difficulty?: string; type?: string; questionCount?: number },
  ) {
    return this.assessmentService.generate(req.user.sub, body);
  }

  @Post('submit')
  submit(
    @Req() req: any,
    @Body() body: { assessmentId: string; answers: { questionId: string; answer: string }[] },
  ) {
    return this.assessmentService.submit(req.user.sub, body.assessmentId, body.answers);
  }

  @Get('history')
  getHistory(@Req() req: any, @Query('limit') limit?: string) {
    return this.assessmentService.getHistory(req.user.sub, limit ? parseInt(limit) : 20);
  }

  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.assessmentService.getById(req.user.sub, id);
  }
}
