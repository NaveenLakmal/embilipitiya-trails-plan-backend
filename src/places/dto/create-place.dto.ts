import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  IsOptional,
  Matches,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Validates that a string is a valid HH:MM time.
 */
const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreatePlaceDto {
  @ApiProperty({ example: 'Udawalawe National Park' })
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty.' })
  name: string;

  @ApiProperty({ example: 'A famous wildlife park known for wild elephants.' })
  @IsString()
  @IsNotEmpty({ message: 'description must not be empty.' })
  description: string;

  @ApiProperty({ example: 1 })
  @IsInt({ message: 'category_id must be an integer.' })
  @IsNotEmpty({ message: 'category_id is required.' })
  @Type(() => Number)
  category_id: number;

  @ApiProperty({ example: '06:00', description: 'HH:MM format' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'opening_time must be in HH:MM format.' })
  opening_time: string;

  @ApiProperty({ example: '18:00', description: 'HH:MM format' })
  @IsString()
  @Matches(TIME_REGEX, { message: 'closing_time must be in HH:MM format.' })
  closing_time: string;

  @ApiProperty({ example: 6.4744 })
  @IsNumber({}, { message: 'latitude must be a number.' })
  @Type(() => Number)
  latitude: number;

  @ApiProperty({ example: 80.8889 })
  @IsNumber({}, { message: 'longitude must be a number.' })
  @Type(() => Number)
  longitude: number;

  @ApiProperty({ example: 22.4, description: 'Must be >= 0' })
  @IsNumber({}, { message: 'distance_km must be a number.' })
  @Min(0, { message: 'distance_km must be a non-negative number.' })
  @Type(() => Number)
  distance_km: number;

  @ApiPropertyOptional({ example: 'Carry water and binoculars.' })
  @IsOptional()
  @IsString()
  travel_tips?: string;

  @ApiProperty({ example: 180, description: 'Positive integer, in minutes' })
  @IsInt({ message: 'visit_duration_minutes must be an integer.' })
  @IsPositive({ message: 'visit_duration_minutes must be a positive integer.' })
  @Type(() => Number)
  visit_duration_minutes: number;

  @ApiPropertyOptional({ example: 'https://example.com/photo.jpg' })
  @IsOptional()
  @IsString()
  photo_url?: string;

  @ApiPropertyOptional({
    example: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
    description: 'Array of photo URLs',
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'photo_urls must be an array of strings.' })
  @IsString({ each: true, message: 'Each item in photo_urls must be a string.' })
  photo_urls?: string[];
}
