import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard, Roles } from '../auth/guards/roles.guard';
import { CollegeService } from './college.service';

@Controller('college')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('faculty', 'admin')
export class CollegeController {
  constructor(private readonly collegeService: CollegeService) {}

  @Get('students')
  getStudents(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.collegeService.getStudentOverview(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @Get('students/:id')
  getStudentDetail(@Param('id') id: string) {
    return this.collegeService.getStudentDetail(id);
  }

  @Get('topics')
  getTopicCoverage() {
    return this.collegeService.getTopicCoverage();
  }

  @Get('weaknesses')
  getWeaknesses(@Query('curriculumId') curriculumId?: string) {
    return this.collegeService.getClassWeaknesses(curriculumId);
  }
}
