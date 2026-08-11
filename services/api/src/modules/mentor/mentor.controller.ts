import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MentorService } from './mentor.service';

@Controller('mentor')
@UseGuards(JwtAuthGuard)
export class MentorController {
  constructor(private readonly mentorService: MentorService) {}

  @Post('chat')
  chat(@Req() req: any, @Body() body: { message: string }) {
    return this.mentorService.chat(req.user.sub, body.message);
  }

  @Get('history')
  getHistory(@Req() req: any) {
    return this.mentorService.getHistory(req.user.sub);
  }
}
