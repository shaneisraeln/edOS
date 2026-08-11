import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChallengesService } from './challenges.service';

@Controller('challenges')
@UseGuards(JwtAuthGuard)
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @Post('generate')
  generate(@Req() req: any, @Body() body?: { topic?: string }) {
    return this.challengesService.generateChallenge(req.user.sub, body?.topic);
  }

  @Post('submit')
  submit(@Req() req: any, @Body() body: { challengeId: string; answer: string }) {
    return this.challengesService.submitAnswer(req.user.sub, body.challengeId, body.answer);
  }

  @Get('pending')
  getPending(@Req() req: any) {
    return this.challengesService.getPendingChallenge(req.user.sub);
  }
}
