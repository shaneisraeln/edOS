import { Controller, Get, Post, Patch, Body, Query, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // --- Users ---

  @Get('users')
  getUsers(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.adminService.getUsers(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Patch('users/role')
  updateRole(@Req() req: any, @Body() body: { userId: string; role: string }) {
    return this.adminService.updateUserRole(req.user.sub, body.userId, body.role);
  }

  // --- Curricula ---

  @Get('curricula')
  getCurricula() {
    return this.adminService.getCurricula();
  }

  @Post('curricula/import')
  bulkImport(
    @Req() req: any,
    @Body() body: { name: string; curriculumId: string; concepts: any[] },
  ) {
    return this.adminService.bulkImportCurriculum(req.user.sub, body);
  }

  // --- Analytics ---

  @Get('analytics')
  getAnalytics() {
    return this.adminService.getPlatformAnalytics();
  }

  // --- Audit ---

  @Get('audit')
  getAuditLogs(@Query('page') page?: string) {
    return this.adminService.getAuditLogs(page ? parseInt(page) : 1);
  }
}
