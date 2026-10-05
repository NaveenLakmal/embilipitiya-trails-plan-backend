import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Place } from '../places/place.entity';

/**
 * Favourite entity — schema only.
 * Working add/remove-favourite endpoints require an authenticated user.
 * That auth system will be built in a later phase.
 * The module's endpoints currently return 501 Not Implemented.
 */
@Entity('favourites')
export class Favourite {
  @PrimaryGeneratedColumn({ name: 'favourite_id' })
  favourite_id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @ManyToOne(() => User, (user) => user.favourites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'place_id' })
  place_id: number;

  @ManyToOne(() => Place, (place) => place.favourites, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place: Place;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
