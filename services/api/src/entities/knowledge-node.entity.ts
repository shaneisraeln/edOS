import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { ConceptEntity } from './concept.entity';

@Entity('knowledge_nodes')
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

  @Column({ type: 'float', default: 0 })
  confidence: number;

  @Column({ type: 'float', default: 0 })
  mastery: number;

  @Column({ nullable: true, type: 'timestamp' })
  lastRevision: Date;

  @Column({ default: 0 })
  practiceCount: number;

  @Column({ type: 'float', nullable: true })
  assessmentScore: number;

  @Column({ type: 'float', default: 50 })
  weaknessScore: number;

  @Column({ default: 0 })
  revisionCount: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
