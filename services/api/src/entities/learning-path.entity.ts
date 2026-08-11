import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('learning_paths')
export class LearningPathEntity {
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

  @Column({ default: 'active' })
  status: string; // active, completed, paused

  @Column({ type: 'float', default: 0 })
  progress: number; // 0-100

  @OneToMany(() => PathNodeEntity, (node) => node.path)
  nodes: PathNodeEntity[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('path_nodes')
export class PathNodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  pathId: string;

  @ManyToOne(() => LearningPathEntity, (path) => path.nodes)
  @JoinColumn({ name: 'pathId' })
  path: LearningPathEntity;

  @Column()
  title: string;

  @Column({ nullable: true })
  description: string;

  @Column()
  order: number;

  @Column({ default: 'locked' })
  status: string; // locked, available, in_progress, verified

  @Column({ type: 'float', default: 0 })
  score: number; // quiz score when verified

  @Column({ nullable: true })
  verifiedAt: Date;

  @Column({ default: false })
  selfLearned: boolean; // user learned this outside the plan

  @Column({ nullable: true })
  conceptId: string;
}
