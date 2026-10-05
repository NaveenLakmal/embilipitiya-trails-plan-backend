import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Favourite } from '../favourites/favourite.entity';
import { VisitPlan } from '../plan/visit-plan.entity';

/**
 * User entity — schema only. Auth logic (password hashing, JWT, sessions,
 * guards) will be added in a later phase. Do NOT add any auth-related
 * business logic here yet.
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ name: 'user_id' })
  user_id: number;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  password_hash: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @OneToMany(() => Favourite, (fav) => fav.user)
  favourites: Favourite[];

  @OneToMany(() => VisitPlan, (plan) => plan.user)
  plans: VisitPlan[];
}
