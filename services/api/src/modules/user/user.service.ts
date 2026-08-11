import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { LearningGoalEntity } from '../../entities/learning-goal.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(LearningGoalEntity)
    private readonly goalRepo: Repository<LearningGoalEntity>,
  ) {}

  async getUser(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    const { passwordHash, ...profile } = user;
    return profile;
  }

  async setLearningGoal(
    userId: string,
    data: { curriculumId: string; curriculumName: string; skillLevel: string; targetDate?: string },
  ) {
    const goal = this.goalRepo.create({
      userId,
      curriculumId: data.curriculumId,
      curriculumName: data.curriculumName,
      skillLevel: data.skillLevel,
      targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
    });
    return this.goalRepo.save(goal);
  }

  async getGoals(userId: string) {
    return this.goalRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }
}
