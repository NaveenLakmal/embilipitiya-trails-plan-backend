import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('auth_reset_tokens')
export class AuthResetToken {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  token_id: string;

  @Column({ name: 'admin_id', type: 'int' })
  @Index()
  admin_id: number;

  @Column({ name: 'expires_at', type: 'timestamp with time zone' })
  expires_at: Date;

  @Column({ name: 'consumed', type: 'boolean', default: false })
  consumed: boolean;

  @Column({ name: 'consumed_at', type: 'timestamp with time zone', nullable: true })
  consumed_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
