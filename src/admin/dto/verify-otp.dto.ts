import { IsEmail, IsNotEmpty, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: 'admin@embitrail.lk', description: 'Admin email address' })
  @IsEmail({}, { message: 'Must be a valid email address' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @ApiProperty({ example: '123456', description: 'Six-digit verification code' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'OTP must be exactly 6 numeric digits' })
  otp: string;

  @ApiProperty({ description: 'Short-lived challenge temp_token returned by login' })
  @IsString()
  @IsNotEmpty({ message: 'temp_token is required' })
  temp_token: string;
}
