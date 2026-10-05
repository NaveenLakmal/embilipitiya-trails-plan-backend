import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VisitPlan } from './visit-plan.entity';
import { PlanItem } from './plan-item.entity';
import { Place } from '../places/place.entity';
import { PlanService } from './plan.service';
import { PlanController } from './plan.controller';

@Module({
  imports: [TypeOrmModule.forFeature([VisitPlan, PlanItem, Place])],
  providers: [PlanService],
  controllers: [PlanController],
})
export class PlanModule {}
