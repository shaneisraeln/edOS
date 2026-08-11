import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('permissions')
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @OneToOne(() => UserEntity)
  @JoinColumn({ name: 'userId' })
  user: UserEntity;

  @Column({ default: true })
  browser: boolean;

  @Column({ default: true })
  ide: boolean;

  @Column({ default: true })
  documents: boolean;

  @Column({ default: true })
  aiPlatforms: boolean;

  @Column({ default: true })
  notifications: boolean;

  @Column({ default: false })
  screenContext: boolean;

  @Column({ default: false })
  microphone: boolean;
}
