import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { LearningEventEntity } from './learning-event.entity';
import { SessionParticipantEntity } from './session-participant.entity';

/**
 * A stretch of study, shared across every surface the learner has connected.
 *
 * One session spans the web app, desktop agent, browser extension and editor.
 * Surfaces join it as participants rather than each creating their own session.
 */
@Entity('learning_sessions')
@Index(['userId', 'status'])
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

  /** active | paused | completed | abandoned (see SESSION_STATUS). */
  @Column({ default: 'active' })
  status: string;

  // ------------------------------------------------------- cross-surface state

  /** Which surface started the session, so the UI can say where it came from. */
  @Column({ default: 'web' })
  initiatedBy: string;

  /**
   * 'solo' when only the originating surface is participating, 'multi' once any
   * agent joins. Lets the web app degrade gracefully when nothing is connected.
   */
  @Column({ default: 'solo' })
  mode: string;

  /**
   * Most recent heartbeat from any surface. The reaper uses this to close
   * sessions abandoned by a crashed agent, which previously stayed 'active'
   * forever and swallowed all later events.
   */
  @Column({ nullable: true, type: 'timestamp' })
  lastHeartbeatAt: Date | null;

  @Column({ nullable: true, type: 'timestamp' })
  pausedAt: Date | null;

  /** Why the session ended: 'user' | 'abandoned' | 'superseded'. */
  @Column({ type: 'varchar', nullable: true })
  endedReason: string | null;

  // -------------------------------------------------- recurring check schedule

  /**
   * How often to interrupt with a knowledge check, in seconds.
   *
   * The schedule lives here rather than in each client because timing used to
   * be per-surface and wildly inconsistent — the web page waited 10 minutes,
   * the editor 5 minutes of idle, the desktop agent and browser only on a
   * context switch after 60 seconds of dwell. Four surfaces in one session
   * therefore interrupted the learner four times on four different clocks.
   */
  @Column({ default: 60 })
  checkIntervalSeconds: number;

  /**
   * When the next check becomes due.
   *
   * Surfaces claim a due check with a conditional update on this column, which
   * is what stops all four of them presenting the same question at once.
   */
  @Column({ nullable: true, type: 'timestamp' })
  nextCheckAt: Date | null;

  @Column({ nullable: true, type: 'timestamp' })
  lastCheckAt: Date | null;

  /** How many checks have been shown, for the session summary. */
  @Column({ default: 0 })
  checkCount: number;

  @OneToMany(() => SessionParticipantEntity, (participant) => participant.session)
  participants: SessionParticipantEntity[];

  @OneToMany(() => LearningEventEntity, (event) => event.session)
  events: LearningEventEntity[];

  @CreateDateColumn()
  createdAt: Date;
}
