import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GroupsService } from './groups.service';

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Post('create')
  create(@Req() req: any, @Body() body: { name: string; description?: string }) {
    return this.groupsService.create(req.user.sub, body.name, body.description);
  }

  @Get()
  findAll() {
    return this.groupsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.groupsService.findOne(id);
  }

  @Post(':id/join')
  join(@Req() req: any, @Param('id') id: string) {
    return this.groupsService.join(id, req.user.sub);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.groupsService.getMembers(id);
  }

  @Get(':id/leaderboard')
  getLeaderboard(@Param('id') id: string) {
    return this.groupsService.getLeaderboard(id);
  }
}
