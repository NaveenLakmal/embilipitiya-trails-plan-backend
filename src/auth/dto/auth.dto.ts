import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class SignUpDto {
  @ApiProperty({ example: 'Nimal Perera', description: 'Customer full name' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @ApiProperty({ example: 'nimal@example.com', description: 'Customer email address' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Password (min 8 characters)' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  password: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: 'nimal@example.com', description: 'Customer email address' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({ example: '482910', description: '6-digit OTP code' })
  @IsString()
  @IsNotEmpty({ message: 'Verification code is required.' })
  code: string;
}

export class ResendOtpDto {
  @ApiProperty({ example: 'nimal@example.com', description: 'Customer email address' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({
    example: 'signup',
    enum: ['signup', 'password_reset'],
    required: false,
    description: 'Purpose of OTP',
  })
  @IsOptional()
  @IsString()
  purpose?: 'signup' | 'password_reset';
}

export class LoginDto {
  @ApiProperty({ example: 'nimal@example.com', description: 'Customer email address' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Account password' })
  @IsString()
  @IsNotEmpty({ message: 'Password is required.' })
  password: string;
}

export class GoogleAuthDto {
  @ApiProperty({
    example: 'eyJhbGciOiJSUzI1NiIsImtpZCI6Ij...GoogleIdToken',
    description: 'Google ID token from Google Sign-In SDK',
  })
  @IsString()
  @IsNotEmpty({ message: 'Google ID token is required.' })
  id_token: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'nimal@example.com', description: 'Customer email address' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'nimal@example.com', description: 'Customer email address' })
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  @Transform(({ value }: { value?: string }) => value?.trim().toLowerCase())
  email: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Verified reset_token returned from verify-reset-otp',
  })
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required.' })
  reset_token: string;

  @ApiProperty({ example: 'NewSecretPassword2026!', description: 'New password (min 8 characters)' })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  new_password: string;
}
