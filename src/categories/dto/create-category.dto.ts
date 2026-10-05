import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Natural' })
  @IsString()
  @IsNotEmpty({ message: 'name must not be empty.' })
  name: string;

  @ApiPropertyOptional({ example: 'Rivers, waterfalls, and natural parks.' })
  @IsOptional()
  @IsString()
  description?: string;
}
