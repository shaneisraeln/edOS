import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SettingsService } from './settings.service';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('permissions')
  getPermissions(@Req() req: any) {
    return this.settingsService.getPermissions(req.user.sub);
  }

  @Patch('permissions')
  updatePermissions(@Req() req: any, @Body() body: any) {
    return this.settingsService.updatePermissions(req.user.sub, body);
  }

  @Get('devices')
  getDevices(@Req() req: any) {
    return this.settingsService.getDevices(req.user.sub);
  }

  @Post('devices')
  registerDevice(@Req() req: any, @Body() body: { deviceName: string; platform: string; deviceId?: string }) {
    return this.settingsService.registerDevice(req.user.sub, body);
  }

  @Delete('devices/:id')
  removeDevice(@Req() req: any, @Param('id') id: string) {
    return this.settingsService.removeDevice(req.user.sub, id);
  }
}
