import { Controller, Get, Post, Patch, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LearningPathService } from './learning-path.service';

@Controller('paths')
@UseGuards(JwtAuthGuard)
export class LearningPathController {
  constructor(private readonly pathService: LearningPathService) {}

  /** Generate a structured path from a topic using AI */
  @Post('generate')
  generate(@Req() req: any, @Body() body: { topic: string; description?: string }) {
    return this.pathService.generatePath(req.user.sub, body.topic, body.description);
  }

  /** Create a custom path from user-provided steps */
  @Post('custom')
  createCustom(@Req() req: any, @Body() body: { title: string; steps: string[] }) {
    return this.pathService.createCustomPath(req.user.sub, body.title, body.steps);
  }

  /** Get all paths for the user */
  @Get()
  getAll(@Req() req: any) {
    return this.pathService.getUserPaths(req.user.sub);
  }

  /** Get a specific path with all nodes */
  @Get(':id')
  getPath(@Req() req: any, @Param('id') id: string) {
    return this.pathService.getPath(req.user.sub, id);
  }

  /** Verify a node (trigger quiz for that topic) */
  @Post(':pathId/verify/:nodeId')
  verifyNode(@Req() req: any, @Param('pathId') pathId: string, @Param('nodeId') nodeId: string) {
    return this.pathService.verifyNode(req.user.sub, pathId, nodeId);
  }

  /** Submit quiz answers for a node verification */
  @Post(':pathId/submit/:nodeId')
  submitVerification(
    @Req() req: any,
    @Param('pathId') pathId: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { quizId: string; answers: { questionId: string; answer: string }[] },
  ) {
    return this.pathService.submitVerification(req.user.sub, pathId, nodeId, body.quizId, body.answers);
  }

  /** Mark a node as self-learned (detected by the system) */
  @Patch(':pathId/self-learned/:nodeId')
  markSelfLearned(@Req() req: any, @Param('pathId') pathId: string, @Param('nodeId') nodeId: string) {
    return this.pathService.markSelfLearned(req.user.sub, pathId, nodeId);
  }
}
