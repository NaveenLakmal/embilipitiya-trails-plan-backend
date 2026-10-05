import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VisitPlan } from './visit-plan.entity';
import { PlanItem } from './plan-item.entity';
import { Place } from '../places/place.entity';
import { AddPlanItemDto, ReorderPlanDto } from './dto/plan.dto';

const MAX_PLAN_PLACES = 8;

@Injectable()
export class PlanService {
  constructor(
    @InjectRepository(VisitPlan)
    private readonly planRepo: Repository<VisitPlan>,
    @InjectRepository(PlanItem)
    private readonly itemRepo: Repository<PlanItem>,
    @InjectRepository(Place)
    private readonly placeRepo: Repository<Place>,
  ) {}

  /**
   * Find or create the VisitPlan for the given session_id.
   */
  async findOrCreatePlan(sessionId: string): Promise<VisitPlan> {
    let plan = await this.planRepo.findOne({
      where: { session_id: sessionId },
    });
    if (!plan) {
      plan = this.planRepo.create({ session_id: sessionId, user_id: null });
      plan = await this.planRepo.save(plan);
    }
    return plan;
  }

  /**
   * GET /plan — return the plan with ordered PlanItems each embedding the full Place.
   */
  async getPlan(sessionId: string) {
    const plan = await this.findOrCreatePlan(sessionId);

    const items = await this.itemRepo.find({
      where: { plan_id: plan.plan_id },
      relations: { place: true },
      order: { visit_order: 'ASC' },
    });

    return {
      plan_id: plan.plan_id,
      session_id: plan.session_id,
      created_at: plan.created_at,
      items: items.map((item) => ({
        plan_item_id: item.plan_item_id,
        visit_order: item.visit_order,
        place: item.place,
      })),
    };
  }

  /**
   * POST /plan/items — add a place to the plan.
   * Rejects if already 8 places, or if the place is already in the plan.
   */
  async addItem(sessionId: string, dto: AddPlanItemDto): Promise<PlanItem> {
    const plan = await this.findOrCreatePlan(sessionId);

    // Count existing items
    const existingItems = await this.itemRepo.find({
      where: { plan_id: plan.plan_id },
    });

    if (existingItems.length >= MAX_PLAN_PLACES) {
      throw new BadRequestException(
        `You can select a maximum of ${MAX_PLAN_PLACES} places for a one-day plan.`,
      );
    }

    const alreadyAdded = existingItems.some(
      (item) => item.place_id === dto.placeId,
    );
    if (alreadyAdded) {
      throw new BadRequestException(
        'This place is already in your visit plan.',
      );
    }

    // Verify the place exists
    const place = await this.placeRepo.findOne({
      where: { place_id: dto.placeId },
    });
    if (!place) {
      throw new NotFoundException('Place not found.');
    }

    const newItem = this.itemRepo.create({
      plan_id: plan.plan_id,
      place_id: dto.placeId,
      visit_order: existingItems.length + 1,
    });

    return this.itemRepo.save(newItem);
  }

  /**
   * DELETE /plan/items/:planItemId — remove one place from the plan.
   */
  async removeItem(sessionId: string, planItemId: number): Promise<void> {
    const plan = await this.findOrCreatePlan(sessionId);
    const item = await this.itemRepo.findOne({
      where: { plan_item_id: planItemId, plan_id: plan.plan_id },
    });
    if (!item) {
      throw new NotFoundException('Plan item not found in your plan.');
    }
    await this.itemRepo.remove(item);

    // Re-number visit_order to keep it contiguous
    const remaining = await this.itemRepo.find({
      where: { plan_id: plan.plan_id },
      order: { visit_order: 'ASC' },
    });
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].visit_order = i + 1;
    }
    if (remaining.length > 0) {
      await this.itemRepo.save(remaining);
    }
  }

  /**
   * PUT /plan/order — persist a new visit_order for all plan items.
   * The frontend sends an ordered array of planItemIds (the new order).
   */
  async reorderItems(
    sessionId: string,
    dto: ReorderPlanDto,
  ): Promise<{ plan_item_id: number; visit_order: number }[]> {
    const plan = await this.findOrCreatePlan(sessionId);

    const items = await this.itemRepo.find({
      where: { plan_id: plan.plan_id },
    });

    const itemMap = new Map(items.map((i) => [i.plan_item_id, i]));

    // Validate that all provided IDs belong to this plan
    for (const id of dto.planItemIds) {
      if (!itemMap.has(id)) {
        throw new BadRequestException(
          `Plan item ${id} does not belong to your current plan.`,
        );
      }
    }

    const updates = dto.planItemIds.map((id, index) => {
      const item = itemMap.get(id)!;
      item.visit_order = index + 1;
      return item;
    });

    const saved = await this.itemRepo.save(updates);
    return saved.map((i) => ({
      plan_item_id: i.plan_item_id,
      visit_order: i.visit_order,
    }));
  }

  /**
   * DELETE /plan — clear all items in the current session's plan.
   */
  async clearPlan(sessionId: string): Promise<{ message: string }> {
    const plan = await this.findOrCreatePlan(sessionId);
    await this.itemRepo.delete({ plan_id: plan.plan_id });
    return { message: 'Plan cleared.' };
  }
}
