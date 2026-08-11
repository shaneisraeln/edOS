import { Controller, Get, Post, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserService } from './user.service';

@Controller('user')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('profile')
  getProfile(@Req() req: any) {
    return this.userService.getUser(req.user.sub);
  }

  @Post('goals')
  setGoal(
    @Req() req: any,
    @Body() body: { curriculumId: string; curriculumName: string; skillLevel: string; targetDate?: string },
  ) {
    return this.userService.setLearningGoal(req.user.sub, body);
  }

  @Get('goals')
  getGoals(@Req() req: any) {
    return this.userService.getGoals(req.user.sub);
  }
}
