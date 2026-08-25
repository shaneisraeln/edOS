import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SessionService } from './session.service';
import { SessionCheckService } from './session-check.service';
import {
  AnswerCheckDto,
  EndSessionDto,
  HeartbeatDto,
  JoinSessionDto,
  LeaveSessionDto,
  PulseDto,
  SkipCheckDto,
  StartSessionDto,
} from './session.dto';

/**
 * The cross-surface session control plane.
 *
 * Every surface — web, desktop agent, browser extension, editor — talks to
 * these endpoints. Starting from any one of them starts the same session for
 * all of them.
 */
@ApiTags('session')
@ApiBearerAuth()
@Controller('session')
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly checks: SessionCheckService,
  ) {}

  @Post('pulse')
  @HttpCode(200)
  @ApiOperation({
    summary: 'One tick from a surface: stay joined, and collect anything due',
    description:
      'The single call an agent needs. Keeps this surface live in the shared session, and returns any knowledge check this surface should present plus any end-of-session prompt if the session was ended elsewhere.',
  })
  pulse(@Req() req: any, @Body() body: PulseDto) {
    return this.sessions.pulse(req.user.sub, body);
  }

  @Post('check/answer')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Answer a knowledge check',
    description:
      'Graded against the exact question that was issued, looked up by check id.',
  })
  answerCheck(@Req() req: any, @Body() body: AnswerCheckDto) {
    return this.checks.answer(req.user.sub, body.checkId, body.answer, body.sessionId);
  }

  @Post('check/skip')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dismiss a knowledge check without answering' })
  async skipCheck(@Req() req: any, @Body() body: SkipCheckDto) {
    await this.checks.skip(req.user.sub, body.checkId, body.sessionId);
    return { ok: true };
  }

  @Post('start')
  @ApiOperation({
    summary: 'Start a session, or join the one already running',
    description:
      'Idempotent. If a session is already active for this user, the calling surface joins it and `created` is false.',
  })
  start(@Req() req: any, @Body() body: StartSessionDto) {
    return this.sessions.start(req.user.sub, body);
  }

  @Get('active')
  @ApiOperation({
    summary: 'The current session, or null',
    description:
      'Agents poll this so they can attach to a session started elsewhere even without a websocket.',
  })
  async active(@Req() req: any) {
    return { session: await this.sessions.getActive(req.user.sub) };
  }

  @Post('join')
  @ApiOperation({ summary: 'Announce that this surface is participating' })
  async join(@Req() req: any, @Body() body: JoinSessionDto) {
    const session = await this.sessions.join(req.user.sub, body);
    // Null means either no active session or the surface is not permitted, so
    // the agent should stay idle rather than capture.
    return { session, joined: session !== null };
  }

  @Post('leave')
  @ApiOperation({ summary: 'Stop participating without ending the session' })
  async leave(@Req() req: any, @Body() body: LeaveSessionDto) {
    return { session: await this.sessions.leave(req.user.sub, body.surface) };
  }

  @Post('heartbeat')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Keep the session and this surface alive',
    description:
      'Returns the refreshed session so one poll is enough for a client to report liveness and update what it displays. A null session means nothing is running and the caller should stop capturing.',
  })
  async heartbeat(@Req() req: any, @Body() body: HeartbeatDto) {
    return { session: await this.sessions.heartbeat(req.user.sub, body) };
  }

  @Post('pause')
  @ApiOperation({ summary: 'Pause capture across every surface' })
  async pause(@Req() req: any) {
    return { session: await this.sessions.pause(req.user.sub) };
  }

  @Post('resume')
  @ApiOperation({ summary: 'Resume capture across every surface' })
  async resume(@Req() req: any) {
    return { session: await this.sessions.resume(req.user.sub) };
  }

  @Post('end')
  @ApiOperation({ summary: 'End the session for every surface' })
  async end(@Req() req: any, @Body() body: EndSessionDto) {
    // Returns session + quiz so the surface that pressed End shows the quiz
    // immediately without needing another pulse. Other surfaces get it through
    // pulse's endedSession.quiz field.
    const result = await this.sessions.end(req.user.sub, body);
    return { session: result.session, quiz: result.quiz };
  }
}
