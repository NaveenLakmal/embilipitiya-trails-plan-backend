import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

/**
 * Admin entity — schema only.
 * Login/session logic will be added in a later phase.
 */
@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn({ name: 'admin_id' })
  admin_id: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  username: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  password_hash: string;
}
