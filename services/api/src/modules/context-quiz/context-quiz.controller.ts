import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ContextQuizService } from './context-quiz.service';

/**
 * Context Quiz API
 *
 * The main learning verification flow:
 * 1. Agent/extension submits learning context (what the user was reading/doing)
 * 2. AI extracts concepts and generates contextual questions
 * 3. Returns quiz to be shown as a popup
 * 4. User answers, gets immediate feedback + knowledge graph update
 */
@Controller('context-quiz')
@UseGuards(JwtAuthGuard)
export class ContextQuizController {
  constructor(private readonly contextQuizService: ContextQuizService) {}

  /**
   * Submit learning context and get a quiz back.
   * Called by browser extension when tab closes or session ends.
   */
  @Post('generate')
  generateFromContext(
    @Req() req: any,
    @Body()
    body: {
      context: string; // page content / summary of what was studied
      source: string; // 'browser', 'ide', 'document'
      url?: string;
      title?: string;
      timeSpent?: number; // seconds spent on this content
      topics?: string[]; // pre-detected topics (optional)
    },
  ) {
    return this.contextQuizService.generateFromContext(req.user.sub, body);
  }

  /**
   * Submit answers to a context quiz.
   */
  @Post('submit')
  submitAnswers(
    @Req() req: any,
    @Body()
    body: {
      quizId: string;
      answers: { questionId: string; answer: string }[];
    },
  ) {
    return this.contextQuizService.submitAnswers(req.user.sub, body.quizId, body.answers);
  }

  /**
   * Get the latest pending quiz (for the popup to fetch).
   */
  @Get('pending')
  getPending(@Req() req: any) {
    return this.contextQuizService.getPendingQuiz(req.user.sub);
  }

  /**
   * Skip a quiz (user chose not to answer).
   */
  @Post('skip')
  skipQuiz(@Req() req: any, @Body() body: { quizId: string }) {
    return this.contextQuizService.skipQuiz(req.user.sub, body.quizId);
  }
}
