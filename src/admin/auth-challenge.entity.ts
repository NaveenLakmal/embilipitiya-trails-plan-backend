import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Admin } from './admin.entity';

export enum ChallengePurpose {
  LOGIN = 'login',
  RESET_PASSWORD = 'reset_password',
}

export enum ChallengeStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  CONSUMED = 'consumed',
  INVALIDATED = 'invalidated',
}

@Entity('auth_challenges')
export class AuthChallenge {
  @PrimaryGeneratedColumn('uuid')
  challenge_id: string;

  @Column({ name: 'admin_id', type: 'int' })
  @Index()
  admin_id: number;

  @ManyToOne(() => Admin, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_id' })
  admin: Admin;

  @Column({ type: 'varchar', length: 50 })
  purpose: ChallengePurpose;

  @Column({ name: 'otp_hash', type: 'varchar', length: 255 })
  otp_hash: string;

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expires_at: Date;

  @Column({ name: 'failed_attempts', type: 'int', default: 0 })
  failed_attempts: number;

  @Column({ name: 'last_sent_at', type: 'timestamp with time zone' })
  last_sent_at: Date;

  @Column({ name: 'consumed_at', type: 'timestamp with time zone', nullable: true })
  consumed_at: Date | null;

  @Column({ type: 'varchar', length: 30, default: ChallengeStatus.PENDING })
  status: ChallengeStatus;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
