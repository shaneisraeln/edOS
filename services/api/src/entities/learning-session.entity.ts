import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { LearningEventEntity } from './learning-event.entity';

@Entity('learning_sessions')
export class LearningSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => UserEntity, (user) => user.learningSessions)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column()
  topic: string;

  @Column({ nullable: true })
  subtopic: string;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ nullable: true, type: 'timestamp' })
  endTime: Date;

  @Column({ nullable: true })
  duration: number;

  @Column({ default: 0 })
  confidence: number;

  @Column('simple-array', { default: '' })
  resourcesUsed: string[];

  @Column({ default: 'active' })
  status: string;

  @OneToMany(() => LearningEventEntity, (event) => event.session)
  events: LearningEventEntity[];

  @CreateDateColumn()
  createdAt: Date;
}
