import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Favourite } from '../favourites/favourite.entity';
import { VisitPlan } from '../plan/visit-plan.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ name: 'user_id' })
  user_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  password_hash: string | null;

  @Column({ name: 'is_email_verified', type: 'boolean', default: false })
  is_email_verified: boolean;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatar_url: string | null;

  @Column({ name: 'google_id', type: 'varchar', length: 255, nullable: true })
  google_id: string | null;

  @Column({ name: 'token_version', type: 'int', default: 1 })
  token_version: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => Favourite, (fav) => fav.user)
  favourites: Favourite[];

  @OneToMany(() => VisitPlan, (plan) => plan.user)
  plans: VisitPlan[];

  get id(): number {
    return this.user_id;
  }
}

