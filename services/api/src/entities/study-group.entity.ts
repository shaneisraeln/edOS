import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('study_groups')
export class StudyGroupEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column()
  createdBy: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'createdBy' })
  creator: UserEntity;

  @CreateDateColumn()
  createdAt: Date;
}
