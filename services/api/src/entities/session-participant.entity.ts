import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { LearningSessionEntity } from './learning-session.entity';

/**
 * One surface's participation in a shared learning session.
 *
 * This is what makes a session cross-surface. Previously each surface called
 * /learning/start and got its own session row, so the desktop agent, the
 * browser extension and the editor were three unrelated sessions for the same
 * stretch of study.
 */
@Entity('session_participants')
// A surface joins a given session once; rejoining updates the existing row.
@Unique('UQ_session_participant_surface', ['sessionId', 'surface'])
@Index(['sessionId', 'status'])
export class SessionParticipantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sessionId: string;

  @ManyToOne(() => LearningSessionEntity, (session) => session.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'sessionId' })
  session: LearningSessionEntity;

  @Column()
  userId: string;

  /** One of SURFACES: web | desktop | browser | ide. */
  @Column()
  surface: string;

  /**
   * Client-supplied stable device key, when the agent provides one.
   *
   * Nullable string columns need an explicit `type`: TypeORM reflects
   * `string | null` as Object and refuses to map it to a Postgres type.
   */
  @Column({ type: 'varchar', nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', nullable: true })
  deviceName: string | null;

  /** live | idle | left */
  @Column({ default: 'live' })
  status: string;

  @Column({ type: 'timestamp' })
  joinedAt: Date;

  /** Last heartbeat or event from this surface. Drives the live/idle badge. */
  @Column({ type: 'timestamp' })
  lastSeenAt: Date;

  @Column({ nullable: true, type: 'timestamp' })
  leftAt: Date | null;

  /** Events attributed to this surface during the session. */
  @Column({ default: 0 })
  eventCount: number;

  @CreateDateColumn()
  createdAt: Date;
}
