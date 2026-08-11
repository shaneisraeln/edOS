import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { StudyGroupEntity } from '../../entities/study-group.entity';
import { GroupMemberEntity } from '../../entities/group-member.entity';
import { KnowledgeNodeEntity } from '../../entities/knowledge-node.entity';
import { UserEntity } from '../../entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([StudyGroupEntity, GroupMemberEntity, KnowledgeNodeEntity, UserEntity]),
  ],
  controllers: [GroupsController],
  providers: [GroupsService],
  exports: [GroupsService],
})
export class GroupsModule {}
