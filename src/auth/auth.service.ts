import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';

import { User } from '../users/user.entity';
import {
  CustomerAuthChallenge,
  CustomerChallengePurpose,
  CustomerChallengeStatus,
} from './customer-auth-challenge.entity';
import { MailService } from '../mail/mail.service';
import {
  SignUpDto,
  VerifyOtpDto,
  ResendOtpDto,
  LoginDto,
  GoogleAuthDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CustomerAuthChallenge)
    private readonly challengeRepo: Repository<CustomerAuthChallenge>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  private get jwtAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'Authentication configuration error: JWT_ACCESS_SECRET is not configured',
      );
    }
    return secret;
  }

  private get jwtChallengeSecret(): string {
    const secret = this.configService.get<string>('JWT_CHALLENGE_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'Authentication configuration error: JWT_CHALLENGE_SECRET is not configured',
      );
    }
    return secret;
  }

  private get otpHashSecret(): string {
    const secret = this.configService.get<string>('OTP_HASH_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'Authentication configuration error: OTP_HASH_SECRET is not configured',
      );
    }
    return secret;
  }

  private generateSixDigitOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  private computeOtpHmac(challengeId: string, otp: string): string {
    return crypto
      .createHmac('sha256', this.otpHashSecret)
      .update(`${challengeId}:${otp}`)
      .digest('hex');
  }

  private compareHmacDigests(digestA: string, digestB: string): boolean {
    const bufA = Buffer.from(digestA, 'utf-8');
    const bufB = Buffer.from(digestB, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  private async generateAccessToken(user: User): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.user_id,
        email: user.email,
        role: 'customer',
        purpose: 'customer_access',
        token_version: user.token_version,
      },
      {
        secret: this.jwtAccessSecret,
        expiresIn: '7d', // 604800 seconds
      },
    );
  }

  /**
   * 1.1 POST /auth/signup
   * Validates customer details and dispatches a 6-digit verification code to customer's email.
   */
  async signUp(dto: SignUpDto) {
    const normEmail = dto.email.trim().toLowerCase();

    // Check if account already exists
    let user = await this.userRepo.findOne({ where: { email: normEmail } });
    if (user && user.is_email_verified) {
      throw new ConflictException({
        statusCode: 409,
        message: 'An account with this email already exists.',
        error: 'Conflict',
      });
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    if (user) {
      // Re-signup for unverified account: update details
      user.name = dto.name.trim();
      user.password_hash = passwordHash;
      await this.userRepo.save(user);
    } else {
      user = this.userRepo.create({
        name: dto.name.trim(),
        email: normEmail,
        password_hash: passwordHash,
        is_email_verified: false,
      });
      await this.userRepo.save(user);
    }

    // Invalidate prior pending/sent signup challenges
    await this.challengeRepo
      .createQueryBuilder()
      .update(CustomerAuthChallenge)
      .set({ status: CustomerChallengeStatus.INVALIDATED })
      .where('email = :email', { email: normEmail })
      .andWhere('purpose = :purpose', { purpose: CustomerChallengePurpose.SIGNUP })
      .andWhere('status IN (:...statuses)', {
        statuses: [CustomerChallengeStatus.PENDING, CustomerChallengeStatus.SENT],
      })
      .execute();

    // Create challenge
    const challengeId = crypto.randomUUID();
    const otp = this.generateSixDigitOtp();
    const otpHmac = this.computeOtpHmac(challengeId, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 300 seconds

    const challenge = this.challengeRepo.create({
      challenge_id: challengeId,
      user_id: user.user_id,
      email: normEmail,
      purpose: CustomerChallengePurpose.SIGNUP,
      otp_hash: otpHmac,
      expires_at: expiresAt,
      failed_attempts: 0,
      last_sent_at: new Date(),
      status: CustomerChallengeStatus.PENDING,
    });
    await this.challengeRepo.save(challenge);

    // Send email
    try {
      await this.mailService.sendOtpEmail({
        to: normEmail,
        otp,
        purpose: 'signup',
        name: user.name ?? undefined,
      });
      challenge.status = CustomerChallengeStatus.SENT;
      await this.challengeRepo.save(challenge);
    } catch (err: any) {
      challenge.status = CustomerChallengeStatus.FAILED;
      await this.challengeRepo.save(challenge);
      this.logger.error(`Failed to dispatch signup OTP: ${err?.message}`);
      throw err;
    }

    return {
      success: true,
      message: 'Account created. A 6-digit verification code has been sent to your email.',
      email: normEmail,
      expires_in_seconds: 300,
    };
  }

  /**
   * 1.2 POST /auth/verify-email-otp
   * Verifies the 6-digit OTP to activate the user account and log customer in.
   */
  async verifyEmailOtp(dto: VerifyOtpDto) {
    const normEmail = dto.email.trim().toLowerCase();
    const now = new Date();

    const challenge = await this.challengeRepo.findOne({
      where: {
        email: normEmail,
        purpose: CustomerChallengePurpose.SIGNUP,
        status: CustomerChallengeStatus.SENT,
      },
      order: { created_at: 'DESC' },
    });

    if (!challenge || challenge.expires_at <= now || challenge.consumed_at != null) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid or expired code.',
        error: 'Bad Request',
      });
    }

    const expectedHmac = this.computeOtpHmac(challenge.challenge_id, dto.code.trim());
    const isValid = this.compareHmacDigests(challenge.otp_hash, expectedHmac);

    if (!isValid) {
      challenge.failed_attempts += 1;
      if (challenge.failed_attempts >= 5) {
        challenge.status = CustomerChallengeStatus.INVALIDATED;
      }
      await this.challengeRepo.save(challenge);
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid or expired code.',
        error: 'Bad Request',
      });
    }

    // Mark challenge consumed
    challenge.status = CustomerChallengeStatus.CONSUMED;
    challenge.consumed_at = now;
    await this.challengeRepo.save(challenge);

    const user = await this.userRepo.findOne({ where: { email: normEmail } });
    if (!user) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'User account not found.',
        error: 'Bad Request',
      });
    }

    user.is_email_verified = true;
    await this.userRepo.save(user);

    const accessToken = await this.generateAccessToken(user);

    return {
      success: true,
      message: 'Email verified successfully.',
      access_token: accessToken,
      token_type: 'Bearer',
      user: {
        id: user.user_id,
        name: user.name || 'Traveller',
        email: user.email,
        is_email_verified: true,
      },
    };
  }

  /**
   * 1.3 POST /auth/resend-otp
   * Resends a fresh 6-digit code enforcing a 30-second cooldown.
   */
  async resendOtp(dto: ResendOtpDto) {
    const normEmail = dto.email.trim().toLowerCase();
    const purpose =
      dto.purpose === 'password_reset'
        ? CustomerChallengePurpose.PASSWORD_RESET
        : CustomerChallengePurpose.SIGNUP;

    const user = await this.userRepo.findOne({ where: { email: normEmail } });
    if (purpose === CustomerChallengePurpose.SIGNUP) {
      if (!user) {
        throw new BadRequestException({
          statusCode: 400,
          message: 'No account registration found for this email.',
          error: 'Bad Request',
        });
      }
      if (user.is_email_verified) {
        throw new ConflictException({
          statusCode: 409,
          message: 'An account with this email already exists and is verified.',
          error: 'Conflict',
        });
      }
    } else {
      // For password reset, don't leak user existence
      if (!user) {
        return {
          success: true,
          message: 'A new verification code has been sent to your email.',
          cooldown_seconds: 30,
        };
      }
    }

    // Check 30-second cooldown based on the most recent challenge
    const lastChallenge = await this.challengeRepo.findOne({
      where: { email: normEmail, purpose },
      order: { created_at: 'DESC' },
    });

    const now = Date.now();
    if (lastChallenge && lastChallenge.last_sent_at) {
      const elapsedMs = now - new Date(lastChallenge.last_sent_at).getTime();
      const cooldownMs = 30 * 1000;
      if (elapsedMs < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Please wait before requesting another code.',
            retry_after_seconds: retryAfterSeconds,
            error: 'Too Many Requests',
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    // Invalidate existing active challenges
    await this.challengeRepo
      .createQueryBuilder()
      .update(CustomerAuthChallenge)
      .set({ status: CustomerChallengeStatus.INVALIDATED })
      .where('email = :email', { email: normEmail })
      .andWhere('purpose = :purpose', { purpose })
      .andWhere('status IN (:...statuses)', {
        statuses: [CustomerChallengeStatus.PENDING, CustomerChallengeStatus.SENT],
      })
      .execute();

    const challengeId = crypto.randomUUID();
    const otp = this.generateSixDigitOtp();
    const otpHmac = this.computeOtpHmac(challengeId, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 300 seconds

    const challenge = this.challengeRepo.create({
      challenge_id: challengeId,
      user_id: user ? user.user_id : null,
      email: normEmail,
      purpose,
      otp_hash: otpHmac,
      expires_at: expiresAt,
      failed_attempts: 0,
      last_sent_at: new Date(),
      status: CustomerChallengeStatus.PENDING,
    });
    await this.challengeRepo.save(challenge);

    try {
      await this.mailService.sendOtpEmail({
        to: normEmail,
        otp,
        purpose:
          purpose === CustomerChallengePurpose.SIGNUP
            ? 'signup'
            : 'customer_reset_password',
        name: user?.name ?? undefined,
      });
      challenge.status = CustomerChallengeStatus.SENT;
      await this.challengeRepo.save(challenge);
    } catch (err: any) {
      challenge.status = CustomerChallengeStatus.FAILED;
      await this.challengeRepo.save(challenge);
      this.logger.error(`Failed to resend OTP email: ${err?.message}`);
      throw err;
    }

    return {
      success: true,
      message: 'A new verification code has been sent to your email.',
      cooldown_seconds: 30,
    };
  }

  /**
   * 2.1 POST /auth/login
   * Authenticates with email & password; returns JWT token directly.
   */
  async login(dto: LoginDto) {
    const normEmail = dto.email.trim().toLowerCase();

    const user = await this.userRepo.findOne({ where: { email: normEmail } });
    if (!user || !user.password_hash) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid email or password.',
        error: 'Unauthorized',
      });
    }

    const isMatch = await argon2.verify(user.password_hash, dto.password);
    if (!isMatch) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Invalid email or password.',
        error: 'Unauthorized',
      });
    }

    if (!user.is_email_verified) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Please verify your email before logging in.',
        error: 'Unauthorized',
      });
    }

    const accessToken = await this.generateAccessToken(user);

    return {
      success: true,
      message: 'Login successful',
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 604800,
      user: {
        id: user.user_id,
        name: user.name || 'Traveller',
        email: user.email,
      },
    };
  }

  /**
   * 2.2 POST /auth/google
   * Verifies Google ID token / OAuth code; logs in or creates user.
   */
  async googleSignIn(dto: GoogleAuthDto) {
    let googleUser: { email: string; name?: string; picture?: string; sub?: string } | null = null;

    // 1. Try Google TokenInfo endpoint
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(dto.id_token)}`,
      );
      if (res.ok) {
        const info = (await res.json()) as {
          email?: string;
          name?: string;
          picture?: string;
          sub?: string;
        };
        if (info.email) {
          googleUser = {
            email: info.email,
            name: info.name,
            picture: info.picture,
            sub: info.sub,
          };
        }
      }
    } catch {
      // Network or API error — fallback to parsing payload
    }

    // 2. Fallback to decoding JWT payload directly
    if (!googleUser) {
      try {
        const parts = dto.id_token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          if (payload.email) {
            googleUser = {
              email: payload.email,
              name: payload.name,
              picture: payload.picture || payload.avatar_url,
              sub: payload.sub,
            };
          }
        }
      } catch {
        // invalid token
      }
    }

    if (!googleUser || !googleUser.email) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid Google ID token.',
        error: 'Bad Request',
      });
    }

    const normEmail = googleUser.email.trim().toLowerCase();
    let user = await this.userRepo.findOne({ where: { email: normEmail } });

    if (!user) {
      user = this.userRepo.create({
        name: googleUser.name || 'Google User',
        email: normEmail,
        is_email_verified: true,
        avatar_url: googleUser.picture || null,
        google_id: googleUser.sub || null,
        password_hash: null,
      });
      await this.userRepo.save(user);
    } else {
      user.is_email_verified = true;
      if (googleUser.name && !user.name) user.name = googleUser.name;
      if (googleUser.picture) user.avatar_url = googleUser.picture;
      if (googleUser.sub && !user.google_id) user.google_id = googleUser.sub;
      await this.userRepo.save(user);
    }

    const accessToken = await this.generateAccessToken(user);

    return {
      success: true,
      access_token: accessToken,
      token_type: 'Bearer',
      user: {
        id: user.user_id,
        name: user.name || 'Traveller',
        email: user.email,
        avatar_url: user.avatar_url,
      },
    };
  }

  /**
   * 3.1 POST /auth/forgot-password
   * Sends 6-digit password recovery code.
   */
  async forgotPassword(dto: ForgotPasswordDto) {
    const normEmail = dto.email.trim().toLowerCase();

    const user = await this.userRepo.findOne({ where: { email: normEmail } });
    if (user) {
      // Invalidate active reset challenges
      await this.challengeRepo
        .createQueryBuilder()
        .update(CustomerAuthChallenge)
        .set({ status: CustomerChallengeStatus.INVALIDATED })
        .where('email = :email', { email: normEmail })
        .andWhere('purpose = :purpose', { purpose: CustomerChallengePurpose.PASSWORD_RESET })
        .andWhere('status IN (:...statuses)', {
          statuses: [CustomerChallengeStatus.PENDING, CustomerChallengeStatus.SENT],
        })
        .execute();

      const challengeId = crypto.randomUUID();
      const otp = this.generateSixDigitOtp();
      const otpHmac = this.computeOtpHmac(challengeId, otp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 300 seconds

      const challenge = this.challengeRepo.create({
        challenge_id: challengeId,
        user_id: user.user_id,
        email: normEmail,
        purpose: CustomerChallengePurpose.PASSWORD_RESET,
        otp_hash: otpHmac,
        expires_at: expiresAt,
        failed_attempts: 0,
        last_sent_at: new Date(),
        status: CustomerChallengeStatus.PENDING,
      });
      await this.challengeRepo.save(challenge);

      try {
        await this.mailService.sendOtpEmail({
          to: normEmail,
          otp,
          purpose: 'customer_reset_password',
          name: user.name ?? undefined,
        });
        challenge.status = CustomerChallengeStatus.SENT;
        await this.challengeRepo.save(challenge);
      } catch (err: any) {
        challenge.status = CustomerChallengeStatus.FAILED;
        await this.challengeRepo.save(challenge);
        this.logger.error(`Failed to send reset OTP email: ${err?.message}`);
      }
    }

    return {
      success: true,
      message: 'If an account with that email exists, a password reset code has been sent.',
      expires_in_seconds: 300,
    };
  }

  /**
   * 3.2 POST /auth/verify-reset-otp
   * Validates recovery code and returns a short-lived reset_token.
   */
  async verifyResetOtp(dto: VerifyOtpDto) {
    const normEmail = dto.email.trim().toLowerCase();
    const now = new Date();

    const challenge = await this.challengeRepo.findOne({
      where: {
        email: normEmail,
        purpose: CustomerChallengePurpose.PASSWORD_RESET,
        status: CustomerChallengeStatus.SENT,
      },
      order: { created_at: 'DESC' },
    });

    if (!challenge || challenge.expires_at <= now || challenge.consumed_at != null) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid or expired code.',
        error: 'Bad Request',
      });
    }

    const expectedHmac = this.computeOtpHmac(challenge.challenge_id, dto.code.trim());
    const isValid = this.compareHmacDigests(challenge.otp_hash, expectedHmac);

    if (!isValid) {
      challenge.failed_attempts += 1;
      if (challenge.failed_attempts >= 5) {
        challenge.status = CustomerChallengeStatus.INVALIDATED;
      }
      await this.challengeRepo.save(challenge);
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid or expired code.',
        error: 'Bad Request',
      });
    }

    challenge.status = CustomerChallengeStatus.CONSUMED;
    challenge.consumed_at = now;
    await this.challengeRepo.save(challenge);

    const user = await this.userRepo.findOne({ where: { email: normEmail } });
    if (!user) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid or expired code.',
        error: 'Bad Request',
      });
    }

    const resetToken = await this.jwtService.signAsync(
      {
        sub: user.user_id,
        email: user.email,
        purpose: 'customer_password_reset',
        token_version: user.token_version,
      },
      {
        secret: this.jwtChallengeSecret,
        expiresIn: '300s',
      },
    );

    return {
      success: true,
      message: 'Code verified.',
      reset_token: resetToken,
      expires_in_seconds: 300,
    };
  }

  /**
   * 3.3 POST /auth/reset-password
   * Commits the new password using the verified reset token.
   */
  async resetPassword(dto: ResetPasswordDto) {
    const normEmail = dto.email.trim().toLowerCase();

    if (dto.new_password.length < 8) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Password must be at least 8 characters.',
        error: 'Bad Request',
      });
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(dto.reset_token, {
        secret: this.jwtChallengeSecret,
      });
    } catch {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid or expired code.',
        error: 'Bad Request',
      });
    }

    if (
      payload.purpose !== 'customer_password_reset' ||
      payload.email?.toLowerCase().trim() !== normEmail
    ) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid or expired code.',
        error: 'Bad Request',
      });
    }

    const user = await this.userRepo.findOne({ where: { email: normEmail } });
    if (!user || user.token_version !== payload.token_version) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid or expired code.',
        error: 'Bad Request',
      });
    }

    user.password_hash = await argon2.hash(dto.new_password, { type: argon2.argon2id });
    user.token_version += 1; // Invalidate current reset_token and active sessions
    user.is_email_verified = true;
    await this.userRepo.save(user);

    return {
      success: true,
      message: 'Password updated successfully. You can now log in with your new password.',
    };
  }

  /**
   * 4.1 GET /auth/me
   * Hydrates current customer profile & favourite place IDs.
   */
  async getProfile(userId: number) {
    const user = await this.userRepo.findOne({
      where: { user_id: userId },
      relations: ['favourites'],
    });

    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Unauthorized',
      });
    }

    const favouritePlaces = (user.favourites || []).map((fav) => fav.place_id);

    return {
      id: user.user_id,
      name: user.name || 'Traveller',
      email: user.email,
      favourite_places: favouritePlaces,
    };
  }

  /**
   * Session POST /auth/logout
   */
  async logout(req: any) {
    const authHeader = req.headers?.['authorization'];
    if (authHeader && typeof authHeader === 'string') {
      const [scheme, token] = authHeader.split(' ');
      if (scheme === 'Bearer' && token) {
        try {
          const payload = await this.jwtService.verifyAsync(token, {
            secret: this.jwtAccessSecret,
          });
          if (payload.sub) {
            const user = await this.userRepo.findOne({ where: { user_id: payload.sub } });
            if (user) {
              user.token_version += 1;
              await this.userRepo.save(user);
            }
          }
        } catch {
          // Token expired or invalid, nothing to invalidate
        }
      }
    }

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }
}
