import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { MemoryService } from './memory.service';

/**
 * Runs knowledge decay automatically every 6 hours.
 * Applies decay to all users' knowledge nodes.
 */
@Injectable()
export class DecayCronService {
  private readonly logger = new Logger(DecayCronService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly memoryService: MemoryService,
  ) {}

  @Cron('0 */6 * * *') // Every 6 hours
  async handleDecay() {
    this.logger.log('Running scheduled knowledge decay...');
    const users = await this.userRepo.find({ select: ['id'] });
    let totalDecayed = 0;

    for (const user of users) {
      const result = await this.memoryService.applyDecay(user.id);
      totalDecayed += result.decayed;
    }

    this.logger.log(`Decay complete: ${totalDecayed} nodes decayed across ${users.length} users`);
  }
}
