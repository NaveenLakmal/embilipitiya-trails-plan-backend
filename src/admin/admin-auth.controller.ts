import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@ApiTags('Admin Auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  private extractIp(req: Request, fallbackIp: string): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || fallbackIp || '127.0.0.1';
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin login credential verification & challenge initiation' })
  @ApiResponse({ status: 200, description: 'Credentials verified; OTP sent to administrator email' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @ApiResponse({ status: 503, description: 'Email delivery unavailable' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Ip() ip: string) {
    const clientIp = this.extractIp(req, ip);
    return this.authService.login(dto, clientIp);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify login OTP and issue admin JWT access token' })
  @ApiResponse({ status: 200, description: 'Authentication successful; access_token issued' })
  @ApiResponse({ status: 400, description: 'Invalid or expired verification code' })
  @ApiResponse({ status: 401, description: 'Invalid or expired challenge token' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request, @Ip() ip: string) {
    const clientIp = this.extractIp(req, ip);
    return this.authService.verifyOtp(dto, clientIp);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification code for login or password recovery' })
  @ApiResponse({ status: 200, description: 'If eligible, code is resent' })
  @ApiResponse({ status: 400, description: 'Validation error or invalid challenge' })
  @ApiResponse({ status: 429, description: 'Cooldown period active' })
  @ApiResponse({ status: 503, description: 'Email delivery unavailable' })
  async resendOtp(@Body() dto: ResendOtpDto, @Req() req: Request, @Ip() ip: string) {
    const clientIp = this.extractIp(req, ip);
    return this.authService.resendOtp(dto, clientIp);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password recovery code' })
  @ApiResponse({ status: 200, description: 'Generic response for recovery code dispatch' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request, @Ip() ip: string) {
    const clientIp = this.extractIp(req, ip);
    return this.authService.forgotPassword(dto, clientIp);
  }

  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify recovery OTP and receive single-use reset token' })
  @ApiResponse({ status: 200, description: 'Recovery code verified; reset_token issued' })
  @ApiResponse({ status: 400, description: 'Invalid or expired recovery code' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async verifyResetOtp(@Body() dto: VerifyResetOtpDto, @Req() req: Request, @Ip() ip: string) {
    const clientIp = this.extractIp(req, ip);
    return this.authService.verifyResetOtp(dto, clientIp);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update admin password using single-use reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token or weak password' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request, @Ip() ip: string) {
    const clientIp = this.extractIp(req, ip);
    return this.authService.resetPassword(dto, clientIp);
  }
}
