import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { StudyGroupEntity } from './study-group.entity';

@Entity('group_members')
export class GroupMemberEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  groupId: string;

  @ManyToOne(() => StudyGroupEntity)
  @JoinColumn({ name: 'groupId' })
  group: StudyGroupEntity;

  @Column()
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ default: 'member' })
  role: string; // 'owner' | 'member'

  @CreateDateColumn()
  joinedAt: Date;
}
