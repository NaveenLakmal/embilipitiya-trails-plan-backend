import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { VisitPlan } from './visit-plan.entity';
import { Place } from '../places/place.entity';

@Entity('plan_items')
export class PlanItem {
  @PrimaryGeneratedColumn({ name: 'plan_item_id' })
  plan_item_id: number;

  @Column({ name: 'plan_id' })
  plan_id: number;

  @ManyToOne(() => VisitPlan, (plan) => plan.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan: VisitPlan;

  @Column({ name: 'place_id' })
  place_id: number;

  @ManyToOne(() => Place, (place) => place.planItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'place_id' })
  place: Place;

  @Column({ name: 'visit_order', type: 'integer' })
  visit_order: number;
}
