import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { ConceptEntity } from './concept.entity';

/**
 * What a learner knows about one concept.
 *
 * `mastery` is the value every read path in the app consumes. It is derived,
 * not authoritative: MasteryService computes it as `masteryRaw * retention`,
 * where masteryRaw is the level the learner has actually demonstrated and
 * retention is the forgetting curve since their last review. That keeps a
 * single column for consumers while letting knowledge decay properly.
 */
@Entity('knowledge_nodes')
// One row per learner per concept. Without this the findOne-then-create pattern
// used by every write site could race and produce duplicates.
@Unique('UQ_knowledge_node_user_concept', ['userId', 'conceptId'])
@Index(['userId', 'nextReviewAt'])
export class KnowledgeNodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column()
  conceptId: string;

  @ManyToOne(() => ConceptEntity)
  @JoinColumn({ name: 'conceptId' })
  concept: ConceptEntity;

  // ------------------------------------------------------- derived, for reads

  /** Retention-adjusted mastery, 0–100. This is what the app displays. */
  @Column({ type: 'float', default: 0 })
  mastery: number;

  /** How much evidence we have, 0–100. Not how well they did. */
  @Column({ type: 'float', default: 0 })
  confidence: number;

  /** Always 100 - mastery. Kept as a column because queries order by it. */
  @Column({ type: 'float', default: 100 })
  weaknessScore: number;

  // -------------------------------------------------- authoritative evidence

  /** Demonstrated level before forgetting is applied, 0–100. */
  @Column({ type: 'float', default: 0 })
  masteryRaw: number;

  /** Sum of evidence weights times the score achieved on each. */
  @Column({ type: 'float', default: 0 })
  successMass: number;

  /** Sum of evidence weights. Drives confidence. */
  @Column({ type: 'float', default: 0 })
  totalMass: number;

  // ------------------------------------------------------------- scheduling

  /** SM-2 ease factor. Higher means intervals grow faster. */
  @Column({ type: 'float', default: 2.5 })
  easeFactor: number;

  /** Current review interval in days. */
  @Column({ type: 'float', default: 0 })
  intervalDays: number;

  /** How long knowledge holds, in days. Drives the retention curve. */
  @Column({ type: 'float', default: 3 })
  stabilityDays: number;

  @Column({ nullable: true, type: 'timestamp' })
  nextReviewAt: Date | null;

  @Column({ nullable: true, type: 'timestamp' })
  lastRevision: Date;

  /** When the retention recompute last ran for this node. */
  @Column({ nullable: true, type: 'timestamp' })
  lastDecayAt: Date | null;

  // ------------------------------------------------------------ bookkeeping

  /** Total pieces of evidence recorded, including passive exposure. */
  @Column({ default: 0 })
  practiceCount: number;

  /** Times this concept was explicitly reviewed or tested. */
  @Column({ default: 0 })
  revisionCount: number;

  /** Most recent graded score as a percentage, for display. */
  @Column({ type: 'float', nullable: true })
  assessmentScore: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
