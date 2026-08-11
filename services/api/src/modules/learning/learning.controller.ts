import { Controller, Post, Get, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LearningService } from './learning.service';

@Controller('learning')
@UseGuards(JwtAuthGuard)
export class LearningController {
  constructor(private readonly learningService: LearningService) {}

  @Post('start')
  startSession(@Req() req: any, @Body() body: { topic: string; subtopic?: string }) {
    return this.learningService.startSession(req.user.sub, body);
  }

  @Post('end')
  endSession(
    @Req() req: any,
    @Body() body: { sessionId: string; confidence?: number },
  ) {
    return this.learningService.endSession(req.user.sub, body.sessionId, body.confidence);
  }

  @Get('history')
  getHistory(@Req() req: any, @Query('limit') limit?: string) {
    return this.learningService.getHistory(req.user.sub, limit ? parseInt(limit) : 20);
  }

  @Post('events')
  recordEvent(
    @Req() req: any,
    @Body()
    body: {
      sessionId: string;
      eventType: string;
      source: string;
      topic?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.learningService.recordEvent(req.user.sub, body);
  }

  @Get('sessions/:sessionId/events')
  getSessionEvents(@Req() req: any, @Param('sessionId') sessionId: string) {
    return this.learningService.getSessionEvents(req.user.sub, sessionId);
  }

  @Post('interval-quiz')
  generateIntervalQuiz(
    @Req() req: any,
    @Body() body: { sessionId: string; topic: string },
  ) {
    return this.learningService.generateIntervalQuiz(req.user.sub, body.sessionId, body.topic);
  }

  @Post('interval-quiz/answer')
  scoreIntervalQuiz(
    @Req() req: any,
    @Body() body: { sessionId: string; quizId: string; answer: string },
  ) {
    return this.learningService.scoreIntervalQuiz(
      req.user.sub,
      body.sessionId,
      body.quizId,
      body.answer,
    );
  }
}
