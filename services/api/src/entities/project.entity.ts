import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('projects')
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  repository: string;

  @Column('simple-array', { default: '' })
  technologies: string[];

  @Column({ nullable: true })
  curriculumId: string;

  @Column({ default: 'in_progress' })
  status: string; // in_progress, submitted, reviewed

  @Column({ type: 'jsonb', nullable: true })
  aiFeedback: Record<string, unknown>;

  @Column({ type: 'float', nullable: true })
  score: number;

  @Column({ nullable: true, type: 'text' })
  submissionNotes: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true, type: 'timestamp' })
  submittedAt: Date;
}
