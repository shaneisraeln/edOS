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

  /**
   * The session this event belongs to, when one was running.
   *
   * Nullable on purpose: agents capture continuously, so events can arrive when
   * the learner has no session open. Those are still worth storing as activity
   * history — the previous behaviour was to auto-create a session for them,
   * which fabricated study sessions the learner never started.
   */
  @Column({ nullable: true, type: 'uuid' })
  sessionId: string | null;

  @ManyToOne(() => LearningSessionEntity, (session) => session.events, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'sessionId' })
  session: LearningSessionEntity | null;

  @Column()
  userId: string;

  @Column()
  eventType: string;

  /** One of SURFACES: web | desktop | browser | ide. */
  @Column()
  source: string;

  @Column({ nullable: true })
  topic: string;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  timestamp: Date;
}
