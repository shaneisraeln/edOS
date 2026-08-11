import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('learning_goals')
export class LearningGoalEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.learningGoals)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column()
  curriculumId: string;

  @Column()
  curriculumName: string;

  @Column({ default: 'beginner' })
  skillLevel: string;

  @Column({ nullable: true, type: 'timestamp' })
  targetDate: Date;

  @Column({ default: 'active' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}
