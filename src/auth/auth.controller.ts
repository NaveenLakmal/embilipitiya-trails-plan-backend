import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  SignUpDto,
  VerifyOtpDto,
  ResendOtpDto,
  LoginDto,
  GoogleAuthDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';

@ApiTags('Customer Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create pending customer account & send 6-digit OTP' })
  @ApiResponse({
    status: 201,
    description: 'Account created. OTP dispatched to email.',
    schema: {
      example: {
        success: true,
        message: 'Account created. A 6-digit verification code has been sent to your email.',
        email: 'nimal@example.com',
        expires_in_seconds: 300,
      },
    },
  })
  @ApiResponse({ status: 409, description: 'An account with this email already exists.' })
  async signUp(@Body() dto: SignUpDto) {
    return this.authService.signUp(dto);
  }

  @Post('verify-email-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify registration OTP and activate customer account' })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully with access token returned.',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired code.' })
  async verifyEmailOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyEmailOtp(dto);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend 6-digit OTP with a 30s cooldown' })
  @ApiResponse({ status: 200, description: 'New verification code dispatched.' })
  @ApiResponse({ status: 429, description: 'Cooldown period active.' })
  async resendOtp(@Body() dto: ResendOtpDto) {
    return this.authService.resendOtp(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Customer email & password direct login' })
  @ApiResponse({ status: 200, description: 'Login successful with access token.' })
  @ApiResponse({ status: 401, description: 'Invalid email or password.' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google OAuth Single Sign-On' })
  @ApiResponse({ status: 200, description: 'Google authenticated successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid Google ID token.' })
  async googleSignIn(@Body() dto: GoogleAuthDto) {
    return this.authService.googleSignIn(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dispatch password recovery code' })
  @ApiResponse({ status: 200, description: 'Password reset code dispatched.' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify password recovery code and obtain reset_token' })
  @ApiResponse({ status: 200, description: 'Code verified with reset_token returned.' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code.' })
  async verifyResetOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyResetOtp(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Commit new password using reset_token' })
  @ApiResponse({ status: 200, description: 'Password updated successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid reset token or password too short.' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Hydrate current customer profile & favourite place IDs' })
  @ApiResponse({ status: 200, description: 'Current customer profile.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async getProfile(@Req() req: { user: { user_id: number; id?: number; email: string } }) {
    const userId = req.user.user_id ?? req.user.id;
    return this.authService.getProfile(userId);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Invalidate customer session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully.' })
  async logout(@Req() req: any) {
    return this.authService.logout(req);
  }
}
