import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('assessments')
export class AssessmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column()
  topic: string;

  @Column({ nullable: true })
  subtopic: string;

  @Column({ default: 'intermediate' })
  difficulty: string;

  @Column({ default: 'mcq' })
  type: string;

  @Column({ type: 'jsonb', default: '[]' })
  questions: Record<string, unknown>[];

  @Column({ type: 'float', nullable: true })
  score: number;

  @Column({ default: 100 })
  maxScore: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({ nullable: true })
  feedback: string;

  @CreateDateColumn()
  generatedAt: Date;

  @Column({ nullable: true, type: 'timestamp' })
  completedAt: Date;
}
