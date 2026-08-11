import { Controller, Get, Param } from '@nestjs/common';
import { RecruiterService } from './recruiter.service';

@Controller('recruiter')
export class RecruiterController {
  constructor(private readonly recruiterService: RecruiterService) {}

  @Get('profile/:userId')
  getProfile(@Param('userId') userId: string) {
    return this.recruiterService.getPublicProfile(userId);
  }

  @Get('verify/:userId/:conceptId')
  verifySkill(
    @Param('userId') userId: string,
    @Param('conceptId') conceptId: string,
  ) {
    return this.recruiterService.verifySkill(userId, conceptId);
  }
}
