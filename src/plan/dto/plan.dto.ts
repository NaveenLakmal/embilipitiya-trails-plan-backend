import { IsInt, IsPositive, IsArray, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class AddPlanItemDto {
  @ApiProperty({ example: 1, description: 'place_id to add to the plan' })
  @IsInt({ message: 'placeId must be an integer.' })
  @IsPositive({ message: 'placeId must be a positive integer.' })
  @Type(() => Number)
  placeId: number;
}

export class ReorderPlanDto {
  @ApiProperty({
    example: [3, 1, 2],
    description: 'Ordered array of plan_item_ids representing the new visit order',
    type: [Number],
  })
  @IsArray({ message: 'planItemIds must be an array.' })
  @ArrayNotEmpty({ message: 'planItemIds must not be empty.' })
  @IsInt({ each: true, message: 'Each planItemId must be an integer.' })
  planItemIds: number[];
}
