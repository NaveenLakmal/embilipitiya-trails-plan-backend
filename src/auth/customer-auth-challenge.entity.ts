import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum CustomerChallengePurpose {
  SIGNUP = 'signup',
  PASSWORD_RESET = 'password_reset',
}

export enum CustomerChallengeStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed',
  CONSUMED = 'consumed',
  INVALIDATED = 'invalidated',
}

@Entity('customer_auth_challenges')
export class CustomerAuthChallenge {
  @PrimaryGeneratedColumn('uuid')
  challenge_id: string;

  @Column({ name: 'user_id', type: 'int', nullable: true })
  @Index()
  user_id: number | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({ type: 'varchar', length: 255 })
  @Index()
  email: string;

  @Column({ type: 'varchar', length: 50 })
  purpose: CustomerChallengePurpose;

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

  @Column({ type: 'varchar', length: 30, default: CustomerChallengeStatus.PENDING })
  status: CustomerChallengeStatus;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
