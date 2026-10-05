import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Category } from '../categories/category.entity';
import { PlanItem } from '../plan/plan-item.entity';
import { Favourite } from '../favourites/favourite.entity';
import { numericTransformer, timeTransformer } from '../common/transformers';

@Entity('places')
export class Place {
  @PrimaryGeneratedColumn({ name: 'place_id' })
  place_id: number;

  @Column({ name: 'category_id' })
  category_id: number;

  @ManyToOne(() => Category, (category) => category.places, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'text' })
  description: string;

  @Column({
    name: 'opening_time',
    type: 'time',
    transformer: timeTransformer,
  })
  opening_time: string;

  @Column({
    name: 'closing_time',
    type: 'time',
    transformer: timeTransformer,
  })
  closing_time: string;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    transformer: numericTransformer,
  })
  latitude: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 7,
    transformer: numericTransformer,
  })
  longitude: number;

  @Column({
    name: 'distance_km',
    type: 'decimal',
    precision: 8,
    scale: 2,
    transformer: numericTransformer,
  })
  distance_km: number;

  @Column({ name: 'travel_tips', type: 'text', nullable: true })
  travel_tips: string | null;

  @Column({ name: 'visit_duration_minutes', type: 'integer' })
  visit_duration_minutes: number;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photo_url: string | null;

  @Column({ name: 'photo_urls', type: 'text', array: true, default: '{}' })
  photo_urls: string[];

  @OneToMany(() => PlanItem, (item) => item.place)
  planItems: PlanItem[];

  @OneToMany(() => Favourite, (fav) => fav.place)
  favourites: Favourite[];
}
