import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
import { Place } from '../places/place.entity';

@Entity('favourites')
@Index('IDX_favourites_user_place', ['user_id', 'place_id'], { unique: true })
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
