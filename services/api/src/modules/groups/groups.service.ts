import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StudyGroupEntity } from '../../entities/study-group.entity';
import { GroupMemberEntity } from '../../entities/group-member.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { UserEntity } from '../../entities/user.entity';

@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(StudyGroupEntity)
    private readonly groupRepo: Repository<StudyGroupEntity>,
    @InjectRepository(GroupMemberEntity)
    private readonly memberRepo: Repository<GroupMemberEntity>,
    @InjectRepository(KnowledgeNodeEntity)
    private readonly knowledgeNodeRepo: Repository<KnowledgeNodeEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async create(userId: string, name: string, description?: string): Promise<StudyGroupEntity> {
    const group = await this.groupRepo.save({
      name,
      description: description || undefined,
      createdBy: userId,
    });

    // Add creator as owner
    await this.memberRepo.save({
      groupId: group.id,
      userId,
      role: 'owner',
    });

    return group;
  }

  async findAll(): Promise<StudyGroupEntity[]> {
    return this.groupRepo.find({
      order: { createdAt: 'DESC' },
      relations: ['creator'],
    });
  }

  async findOne(id: string): Promise<StudyGroupEntity> {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: ['creator'],
    });
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }

  async join(groupId: string, userId: string): Promise<GroupMemberEntity> {
    const group = await this.groupRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');

    const existing = await this.memberRepo.findOne({
      where: { groupId, userId },
    });
    if (existing) throw new ConflictException('Already a member of this group');

    return this.memberRepo.save({
      groupId,
      userId,
      role: 'member',
    });
  }

  async getMembers(groupId: string): Promise<GroupMemberEntity[]> {
    return this.memberRepo.find({
      where: { groupId },
      relations: ['user'],
      order: { joinedAt: 'ASC' },
    });
  }

  async getLeaderboard(groupId: string): Promise<{ userId: string; name: string; averageMastery: number }[]> {
    const members = await this.memberRepo.find({
      where: { groupId },
      relations: ['user'],
    });

    const leaderboard: { userId: string; name: string; averageMastery: number }[] = [];

    for (const member of members) {
      const nodes = await this.knowledgeNodeRepo.find({
        where: { userId: member.userId },
      });

      const averageMastery =
        nodes.length > 0
          ? Math.round(nodes.reduce((sum, n) => sum + n.mastery, 0) / nodes.length)
          : 0;

      leaderboard.push({
        userId: member.userId,
        name: member.user?.name || 'Unknown',
        averageMastery,
      });
    }

    return leaderboard.sort((a, b) => b.averageMastery - a.averageMastery);
  }
}
