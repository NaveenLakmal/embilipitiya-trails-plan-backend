import { IsEmail, IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ResendOtpDto {
  @ApiProperty({ example: 'admin@embitrail.lk', description: 'Admin email address' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({ example: 'login', enum: ['login', 'reset_password'], description: 'Challenge purpose' })
  @IsIn(['login', 'reset_password'], { message: 'Purpose must be either "login" or "reset_password"' })
  purpose: 'login' | 'reset_password';

  @ApiPropertyOptional({ description: 'Required when purpose is login' })
  @ValidateIf((o) => o.purpose === 'login')
  @IsNotEmpty({ message: 'temp_token is required for login resend' })
  @IsString()
  temp_token?: string;
}
