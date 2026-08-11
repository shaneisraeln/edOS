import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { LearningSessionEntity } from './learning-session.entity';

@Entity('learning_events')
export class LearningEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => LearningSessionEntity, (session) => session.events)
  @JoinColumn({ name: 'sessionId' })
  session: LearningSessionEntity;

  @Column()
  userId: string;

  @Column()
  eventType: string;

  @Column()
  source: string;

  @Column({ nullable: true })
  topic: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  timestamp: Date;
}
