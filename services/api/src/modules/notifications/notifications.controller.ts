import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  getNotifications(@Req() req: any, @Query('status') status?: string) {
    return this.notificationsService.getNotifications(req.user.sub, status);
  }

  @Get('unread-count')
  getUnreadCount(@Req() req: any) {
    return this.notificationsService.getUnreadCount(req.user.sub);
  }

  @Post('mark-read')
  markRead(@Req() req: any, @Body() body: { notificationId: string }) {
    return this.notificationsService.markRead(req.user.sub, body.notificationId);
  }

  @Post('mark-all-read')
  markAllRead(@Req() req: any) {
    return this.notificationsService.markAllRead(req.user.sub);
  }

  @Post('generate-reminders')
  generateReminders(@Req() req: any) {
    return this.notificationsService.generateRevisionReminders(req.user.sub);
  }
}
