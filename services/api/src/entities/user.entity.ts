import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { LearningGoalEntity } from './learning-goal.entity';
import { LearningSessionEntity } from './learning-session.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column({ default: 'student' })
  role: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => LearningGoalEntity, (goal) => goal.user)
  learningGoals: LearningGoalEntity[];

  @OneToMany(() => LearningSessionEntity, (session) => session.user)
  learningSessions: LearningSessionEntity[];
}
