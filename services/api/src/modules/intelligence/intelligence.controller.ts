import { Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MemoryService } from './memory.service';
import { RecommendationService } from './recommendation.service';
import { InterviewService } from './interview.service';

@Controller('intelligence')
@UseGuards(JwtAuthGuard)
export class IntelligenceController {
  constructor(
    private readonly memoryService: MemoryService,
    private readonly recommendationService: RecommendationService,
    private readonly interviewService: InterviewService,
  ) {}

  @Get('memory/short')
  getShortTermMemory(@Req() req: any) {
    return this.memoryService.getShortTermMemory(req.user.sub);
  }

  @Get('memory/medium')
  getMediumTermMemory(@Req() req: any) {
    return this.memoryService.getMediumTermMemory(req.user.sub);
  }

  @Get('memory/long')
  getLongTermMemory(@Req() req: any) {
    return this.memoryService.getLongTermMemory(req.user.sub);
  }

  @Get('recommendations')
  getRecommendations(@Req() req: any) {
    return this.recommendationService.getRecommendations(req.user.sub);
  }

  @Get('revision-schedule')
  getRevisionSchedule(@Req() req: any) {
    return this.memoryService.getRevisionSchedule(req.user.sub);
  }

  @Post('decay')
  applyDecay(@Req() req: any) {
    return this.memoryService.applyDecay(req.user.sub);
  }

  @Get('interview-readiness')
  getInterviewReadiness(@Req() req: any) {
    return this.interviewService.getReadiness(req.user.sub);
  }
}
