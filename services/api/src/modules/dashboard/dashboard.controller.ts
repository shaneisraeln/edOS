import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard(@Req() req: any) {
    return this.dashboardService.getDashboard(req.user.sub);
  }

  @Get('mastery')
  getMastery(@Req() req: any) {
    return this.dashboardService.getMastery(req.user.sub);
  }

  @Get('progress')
  getProgress(@Req() req: any) {
    return this.dashboardService.getProgress(req.user.sub);
  }
}
