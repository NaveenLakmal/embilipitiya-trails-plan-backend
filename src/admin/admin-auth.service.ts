import {
  BadRequestException,
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
import { DataSource, Repository } from 'typeorm';

import { Admin } from './admin.entity';
import { AuthChallenge, ChallengePurpose, ChallengeStatus } from './auth-challenge.entity';
import { AuthResetToken } from './auth-reset-token.entity';
import { MailService } from '../mail/mail.service';
import { RateLimiterService } from './rate-limiter.service';
import { LoginDto } from './dto/login.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResendOtpDto } from './dto/resend-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
    @InjectRepository(AuthChallenge)
    private readonly challengeRepo: Repository<AuthChallenge>,
    @InjectRepository(AuthResetToken)
    private readonly resetTokenRepo: Repository<AuthResetToken>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
    private readonly rateLimiter: RateLimiterService,
    private readonly dataSource: DataSource,
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

  /**
   * Find the single admin matching given email address.
   */
  async findAdminByEmail(rawEmail: string): Promise<Admin | null> {
    const email = rawEmail.trim().toLowerCase();
    return this.adminRepo
      .createQueryBuilder('admin')
      .where('LOWER(TRIM(admin.email)) = :email', { email })
      .orWhere('LOWER(TRIM(admin.username)) = :email', { email })
      .getOne();
  }

  /**
   * Secure Argon2id password verification with legacy fallback & transparent migration.
   */
  async verifyPassword(storedHash: string, plainPassword: string): Promise<boolean> {
    if (!storedHash || !plainPassword) return false;
    try {
      if (storedHash.startsWith('$argon2')) {
        return await argon2.verify(storedHash, plainPassword);
      }
      // Fallback for legacy plaintext entries
      return storedHash === plainPassword;
    } catch {
      return false;
    }
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  /**
   * Generate a 6-digit OTP string with node:crypto
   */
  private generateSixDigitOtp(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * Compute HMAC-SHA256 digest bound to the challenge ID
   */
  private computeOtpHmac(challengeId: string, otp: string): string {
    return crypto
      .createHmac('sha256', this.otpHashSecret)
      .update(`${challengeId}:${otp}`)
      .digest('hex');
  }

  /**
   * Timing-safe comparison of HMAC digests
   */
  private compareHmacDigests(digestA: string, digestB: string): boolean {
    const bufA = Buffer.from(digestA, 'utf-8');
    const bufB = Buffer.from(digestB, 'utf-8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * 1. POST /admin/auth/login
   */
  async login(dto: LoginDto, ip: string) {
    const normEmail = dto.email.trim().toLowerCase();

    // Rate limiting: 5 failed credential attempts per 15 minutes per IP & email
    const ipKey = `login:ip:${ip}`;
    const accountKey = `login:account:${normEmail}`;
    this.rateLimiter.checkRateLimit(ipKey, 10, 15 * 60 * 1000);
    this.rateLimiter.checkRateLimit(accountKey, 5, 15 * 60 * 1000);

    const admin = await this.findAdminByEmail(normEmail);
    if (!admin) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isValidPassword = await this.verifyPassword(admin.password_hash, dto.password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Transparently upgrade legacy password to Argon2id if needed
    if (!admin.password_hash.startsWith('$argon2')) {
      admin.password_hash = await this.hashPassword(dto.password);
      if (!admin.email) {
        admin.email = normEmail;
      }
      await this.adminRepo.save(admin);
    }

    // Credentials valid; reset failed rate-limit records for this account
    this.rateLimiter.reset(accountKey);

    // Invalidate existing active login challenges for this admin
    await this.challengeRepo
      .createQueryBuilder()
      .update(AuthChallenge)
      .set({ status: ChallengeStatus.INVALIDATED })
      .where('admin_id = :adminId', { adminId: admin.admin_id })
      .andWhere('purpose = :purpose', { purpose: ChallengePurpose.LOGIN })
      .andWhere('status IN (:...statuses)', {
        statuses: [ChallengeStatus.PENDING, ChallengeStatus.SENT],
      })
      .execute();

    // Create a new challenge
    const challengeId = crypto.randomUUID();
    const otp = this.generateSixDigitOtp();
    const otpHmac = this.computeOtpHmac(challengeId, otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    const now = new Date();

    const challenge = this.challengeRepo.create({
      challenge_id: challengeId,
      admin_id: admin.admin_id,
      purpose: ChallengePurpose.LOGIN,
      otp_hash: otpHmac,
      expires_at: expiresAt,
      failed_attempts: 0,
      last_sent_at: now,
      status: ChallengeStatus.PENDING,
    });
    await this.challengeRepo.save(challenge);

    // Send verification email via SMTP (outside any DB transaction)
    try {
      await this.mailService.sendOtpEmail({
        to: admin.email || normEmail,
        otp,
        purpose: 'login',
      });
      challenge.status = ChallengeStatus.SENT;
      await this.challengeRepo.save(challenge);
    } catch (err) {
      challenge.status = ChallengeStatus.FAILED;
      await this.challengeRepo.save(challenge);
      this.logger.error('Failed to send login OTP email. Aborting login challenge.');
      throw err;
    }

    // Generate short-lived temp_token bound to this login challenge
    const tempToken = await this.jwtService.signAsync(
      {
        sub: admin.admin_id,
        challenge_id: challenge.challenge_id,
        purpose: 'login_challenge',
      },
      {
        secret: this.jwtChallengeSecret,
        expiresIn: '300s',
        algorithm: 'HS256',
      },
    );

    return {
      success: true,
      message: 'A verification code has been sent to your email',
      temp_token: tempToken,
      expires_in_seconds: 300,
    };
  }

  /**
   * 2. POST /admin/auth/verify-otp
   */
  async verifyOtp(dto: VerifyOtpDto, ip: string) {
    this.rateLimiter.checkRateLimit(`verify:ip:${ip}`, 20, 15 * 60 * 1000);

    // Verify temp_token
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(dto.temp_token, {
        secret: this.jwtChallengeSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired verification session. Please log in again.');
    }

    if (payload.purpose !== 'login_challenge' || !payload.challenge_id || !payload.sub) {
      throw new UnauthorizedException('Invalid challenge token format');
    }

    const admin = await this.adminRepo.findOne({ where: { admin_id: payload.sub } });
    if (!admin) {
      throw new UnauthorizedException('Admin account not found');
    }

    const challenge = await this.challengeRepo.findOne({
      where: { challenge_id: payload.challenge_id },
    });

    if (!challenge || challenge.admin_id !== admin.admin_id || challenge.purpose !== ChallengePurpose.LOGIN) {
      throw new BadRequestException('Invalid verification challenge');
    }

    if (challenge.status !== ChallengeStatus.SENT) {
      throw new BadRequestException('Verification code is no longer valid. Please request a new code.');
    }

    if (new Date() > challenge.expires_at) {
      challenge.status = ChallengeStatus.INVALIDATED;
      await this.challengeRepo.save(challenge);
      throw new BadRequestException('Verification code has expired. Please request a new code.');
    }

    if (challenge.failed_attempts >= 5) {
      challenge.status = ChallengeStatus.INVALIDATED;
      await this.challengeRepo.save(challenge);
      throw new BadRequestException('Maximum verification attempts exceeded. Please request a new code.');
    }

    // Verify OTP HMAC
    const expectedHmac = this.computeOtpHmac(challenge.challenge_id, dto.otp);
    const isOtpValid = this.compareHmacDigests(expectedHmac, challenge.otp_hash);

    if (!isOtpValid) {
      challenge.failed_attempts += 1;
      if (challenge.failed_attempts >= 5) {
        challenge.status = ChallengeStatus.INVALIDATED;
      }
      await this.challengeRepo.save(challenge);

      const remaining = 5 - challenge.failed_attempts;
      if (remaining <= 0) {
        throw new BadRequestException('Maximum verification attempts exceeded. Please request a new code.');
      }
      throw new BadRequestException(`Invalid verification code. ${remaining} attempt(s) remaining.`);
    }

    // Atomic consumption: ensures concurrent verification requests cannot both succeed
    const updateResult = await this.challengeRepo
      .createQueryBuilder()
      .update(AuthChallenge)
      .set({ status: ChallengeStatus.CONSUMED, consumed_at: new Date() })
      .where('challenge_id = :id', { id: challenge.challenge_id })
      .andWhere('status = :status', { status: ChallengeStatus.SENT })
      .andWhere('expires_at > :now', { now: new Date() })
      .andWhere('failed_attempts < 5')
      .execute();

    if (!updateResult.affected || updateResult.affected === 0) {
      throw new BadRequestException('Verification code was already used or is no longer valid');
    }

    // Issue 15-minute access token
    const adminEmail = admin.email || admin.username.trim();
    const accessToken = await this.jwtService.signAsync(
      {
        sub: admin.admin_id,
        email: adminEmail,
        role: 'admin',
        purpose: 'admin_access',
        token_version: admin.token_version,
      },
      {
        secret: this.jwtAccessSecret,
        expiresIn: '900s',
        algorithm: 'HS256',
      },
    );

    return {
      success: true,
      message: 'Authentication successful',
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      admin: {
        id: admin.admin_id,
        email: adminEmail,
        role: 'admin',
      },
    };
  }

  /**
   * 3. POST /admin/auth/resend-otp
   */
  async resendOtp(dto: ResendOtpDto, ip: string) {
    this.rateLimiter.checkRateLimit(`resend:ip:${ip}`, 10, 15 * 60 * 1000);

    const normEmail = dto.email.trim().toLowerCase();

    if (dto.purpose === 'login') {
      if (!dto.temp_token) {
        throw new BadRequestException('temp_token is required for login resend');
      }

      let payload: any;
      try {
        payload = await this.jwtService.verifyAsync(dto.temp_token, {
          secret: this.jwtChallengeSecret,
          algorithms: ['HS256'],
        });
      } catch {
        throw new UnauthorizedException('Invalid or expired login challenge token');
      }

      const challenge = await this.challengeRepo.findOne({
        where: { challenge_id: payload.challenge_id },
      });

      if (!challenge || challenge.admin_id !== payload.sub || challenge.purpose !== ChallengePurpose.LOGIN) {
        throw new BadRequestException('Invalid challenge token');
      }

      // Check 30-second cooldown
      const elapsedMs = Date.now() - new Date(challenge.last_sent_at).getTime();
      if (elapsedMs < 30 * 1000) {
        const remainingSeconds = Math.ceil((30 * 1000 - elapsedMs) / 1000);
        throw new HttpException(
          {
            success: false,
            message: `Please wait ${remainingSeconds} seconds before requesting a new code`,
            cooldown_seconds: remainingSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const admin = await this.adminRepo.findOne({ where: { admin_id: challenge.admin_id } });
      if (!admin) {
        throw new UnauthorizedException('Admin account not found');
      }

      // Invalidate the previous challenge
      challenge.status = ChallengeStatus.INVALIDATED;
      await this.challengeRepo.save(challenge);

      // Create replacement challenge
      const newChallengeId = crypto.randomUUID();
      const newOtp = this.generateSixDigitOtp();
      const newOtpHmac = this.computeOtpHmac(newChallengeId, newOtp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const now = new Date();

      const newChallenge = this.challengeRepo.create({
        challenge_id: newChallengeId,
        admin_id: admin.admin_id,
        purpose: ChallengePurpose.LOGIN,
        otp_hash: newOtpHmac,
        expires_at: expiresAt,
        failed_attempts: 0,
        last_sent_at: now,
        status: ChallengeStatus.PENDING,
      });
      await this.challengeRepo.save(newChallenge);

      try {
        await this.mailService.sendOtpEmail({
          to: admin.email || normEmail,
          otp: newOtp,
          purpose: 'login',
        });
        newChallenge.status = ChallengeStatus.SENT;
        await this.challengeRepo.save(newChallenge);
      } catch (err) {
        newChallenge.status = ChallengeStatus.FAILED;
        await this.challengeRepo.save(newChallenge);
        this.logger.error('Resend login OTP email failed.');
        throw err;
      }

      // Rotate login temp_token bound to replacement challenge
      const newTempToken = await this.jwtService.signAsync(
        {
          sub: admin.admin_id,
          challenge_id: newChallenge.challenge_id,
          purpose: 'login_challenge',
        },
        {
          secret: this.jwtChallengeSecret,
          expiresIn: '300s',
          algorithm: 'HS256',
        },
      );

      return {
        success: true,
        message: 'If the request is eligible, a verification code will be sent',
        cooldown_seconds: 30,
        temp_token: newTempToken,
      };
    }

    // Purpose is reset_password
    const admin = await this.findAdminByEmail(normEmail);
    if (admin) {
      const recentChallenge = await this.challengeRepo.findOne({
        where: {
          admin_id: admin.admin_id,
          purpose: ChallengePurpose.RESET_PASSWORD,
        },
        order: { created_at: 'DESC' },
      });

      if (recentChallenge) {
        const elapsedMs = Date.now() - new Date(recentChallenge.last_sent_at).getTime();
        if (elapsedMs < 30 * 1000) {
          const remainingSeconds = Math.ceil((30 * 1000 - elapsedMs) / 1000);
          throw new HttpException(
            {
              success: false,
              message: `Please wait ${remainingSeconds} seconds before requesting a new code`,
              cooldown_seconds: remainingSeconds,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      // Invalidate outstanding recovery challenges
      await this.challengeRepo
        .createQueryBuilder()
        .update(AuthChallenge)
        .set({ status: ChallengeStatus.INVALIDATED })
        .where('admin_id = :adminId', { adminId: admin.admin_id })
        .andWhere('purpose = :purpose', { purpose: ChallengePurpose.RESET_PASSWORD })
        .andWhere('status IN (:...statuses)', {
          statuses: [ChallengeStatus.PENDING, ChallengeStatus.SENT],
        })
        .execute();

      const challengeId = crypto.randomUUID();
      const otp = this.generateSixDigitOtp();
      const otpHmac = this.computeOtpHmac(challengeId, otp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const now = new Date();

      const challenge = this.challengeRepo.create({
        challenge_id: challengeId,
        admin_id: admin.admin_id,
        purpose: ChallengePurpose.RESET_PASSWORD,
        otp_hash: otpHmac,
        expires_at: expiresAt,
        failed_attempts: 0,
        last_sent_at: now,
        status: ChallengeStatus.PENDING,
      });
      await this.challengeRepo.save(challenge);

      try {
        await this.mailService.sendOtpEmail({
          to: admin.email || normEmail,
          otp,
          purpose: 'reset_password',
        });
        challenge.status = ChallengeStatus.SENT;
        await this.challengeRepo.save(challenge);
      } catch (err: any) {
        challenge.status = ChallengeStatus.FAILED;
        await this.challengeRepo.save(challenge);
        this.logger.error(`Failed to send recovery OTP: ${err?.message}`);
      }
    }

    return {
      success: true,
      message: 'If the request is eligible, a verification code will be sent',
      cooldown_seconds: 30,
    };
  }

  /**
   * 4. POST /admin/auth/forgot-password
   */
  async forgotPassword(dto: ForgotPasswordDto, ip: string) {
    this.rateLimiter.checkRateLimit(`forgot:ip:${ip}`, 5, 15 * 60 * 1000);

    const normEmail = dto.email.trim().toLowerCase();
    const admin = await this.findAdminByEmail(normEmail);

    if (admin) {
      const recentChallenge = await this.challengeRepo.findOne({
        where: {
          admin_id: admin.admin_id,
          purpose: ChallengePurpose.RESET_PASSWORD,
        },
        order: { created_at: 'DESC' },
      });

      if (recentChallenge) {
        const elapsedMs = Date.now() - new Date(recentChallenge.last_sent_at).getTime();
        if (elapsedMs < 30 * 1000) {
          const remainingSeconds = Math.ceil((30 * 1000 - elapsedMs) / 1000);
          throw new HttpException(
            {
              success: false,
              message: `Please wait ${remainingSeconds} seconds before requesting a new code`,
              cooldown_seconds: remainingSeconds,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }

      // Invalidate outstanding recovery challenges
      await this.challengeRepo
        .createQueryBuilder()
        .update(AuthChallenge)
        .set({ status: ChallengeStatus.INVALIDATED })
        .where('admin_id = :adminId', { adminId: admin.admin_id })
        .andWhere('purpose = :purpose', { purpose: ChallengePurpose.RESET_PASSWORD })
        .andWhere('status IN (:...statuses)', {
          statuses: [ChallengeStatus.PENDING, ChallengeStatus.SENT],
        })
        .execute();

      const challengeId = crypto.randomUUID();
      const otp = this.generateSixDigitOtp();
      const otpHmac = this.computeOtpHmac(challengeId, otp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      const now = new Date();

      const challenge = this.challengeRepo.create({
        challenge_id: challengeId,
        admin_id: admin.admin_id,
        purpose: ChallengePurpose.RESET_PASSWORD,
        otp_hash: otpHmac,
        expires_at: expiresAt,
        failed_attempts: 0,
        last_sent_at: now,
        status: ChallengeStatus.PENDING,
      });
      await this.challengeRepo.save(challenge);

      try {
        await this.mailService.sendOtpEmail({
          to: admin.email || normEmail,
          otp,
          purpose: 'reset_password',
        });
        challenge.status = ChallengeStatus.SENT;
        await this.challengeRepo.save(challenge);
      } catch (err: any) {
        challenge.status = ChallengeStatus.FAILED;
        await this.challengeRepo.save(challenge);
        this.logger.error(`Recovery email send error: ${err?.message}`);
      }
    }

    // Generic response preserved
    return {
      success: true,
      message: 'If an administrator account exists for this email, a recovery code will be sent',
      expires_in_seconds: 300,
    };
  }

  /**
   * 5. POST /admin/auth/verify-reset-otp
   */
  async verifyResetOtp(dto: VerifyResetOtpDto, ip: string) {
    this.rateLimiter.checkRateLimit(`verify-reset:ip:${ip}`, 15, 15 * 60 * 1000);

    const normEmail = dto.email.trim().toLowerCase();
    const admin = await this.findAdminByEmail(normEmail);

    if (!admin) {
      throw new BadRequestException('Invalid or expired recovery code');
    }

    const challenge = await this.challengeRepo.findOne({
      where: {
        admin_id: admin.admin_id,
        purpose: ChallengePurpose.RESET_PASSWORD,
        status: ChallengeStatus.SENT,
      },
      order: { created_at: 'DESC' },
    });

    if (!challenge) {
      throw new BadRequestException('Invalid or expired recovery code');
    }

    if (new Date() > challenge.expires_at) {
      challenge.status = ChallengeStatus.INVALIDATED;
      await this.challengeRepo.save(challenge);
      throw new BadRequestException('Invalid or expired recovery code');
    }

    if (challenge.failed_attempts >= 5) {
      challenge.status = ChallengeStatus.INVALIDATED;
      await this.challengeRepo.save(challenge);
      throw new BadRequestException('Invalid or expired recovery code');
    }

    // Verify HMAC
    const expectedHmac = this.computeOtpHmac(challenge.challenge_id, dto.otp);
    const isOtpValid = this.compareHmacDigests(expectedHmac, challenge.otp_hash);

    if (!isOtpValid) {
      challenge.failed_attempts += 1;
      if (challenge.failed_attempts >= 5) {
        challenge.status = ChallengeStatus.INVALIDATED;
      }
      await this.challengeRepo.save(challenge);
      throw new BadRequestException('Invalid or expired recovery code');
    }

    // Atomic consumption of recovery challenge
    const updateResult = await this.challengeRepo
      .createQueryBuilder()
      .update(AuthChallenge)
      .set({ status: ChallengeStatus.CONSUMED, consumed_at: new Date() })
      .where('challenge_id = :id', { id: challenge.challenge_id })
      .andWhere('status = :status', { status: ChallengeStatus.SENT })
      .andWhere('expires_at > :now', { now: new Date() })
      .andWhere('failed_attempts < 5')
      .execute();

    if (!updateResult.affected || updateResult.affected === 0) {
      throw new BadRequestException('Recovery code was already used or expired');
    }

    // Issue single-use database-backed reset_token
    const tokenId = crypto.randomBytes(32).toString('hex');
    const resetExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const authResetToken = this.resetTokenRepo.create({
      token_id: tokenId,
      admin_id: admin.admin_id,
      expires_at: resetExpiresAt,
      consumed: false,
    });
    await this.resetTokenRepo.save(authResetToken);

    const resetJwt = await this.jwtService.signAsync(
      {
        sub: admin.admin_id,
        token_id: tokenId,
        purpose: 'password_reset',
      },
      {
        secret: this.jwtChallengeSecret,
        expiresIn: '300s',
        algorithm: 'HS256',
      },
    );

    return {
      success: true,
      message: 'Recovery code verified',
      reset_token: resetJwt,
      expires_in_seconds: 300,
    };
  }

  /**
   * 6. POST /admin/auth/reset-password
   */
  async resetPassword(dto: ResetPasswordDto, ip: string) {
    this.rateLimiter.checkRateLimit(`reset-pass:ip:${ip}`, 5, 15 * 60 * 1000);

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(dto.reset_token, {
        secret: this.jwtChallengeSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (payload.purpose !== 'password_reset' || !payload.token_id || !payload.sub) {
      throw new BadRequestException('Invalid reset token structure');
    }

    const normEmail = dto.email.trim().toLowerCase();
    const newPasswordHash = await this.hashPassword(dto.new_password);

    // Atomically consume reset_token and update password + invalidate sessions
    await this.dataSource.transaction(async (manager) => {
      const resetTokenRecord = await manager.findOne(AuthResetToken, {
        where: { token_id: payload.token_id, admin_id: payload.sub },
      });

      if (!resetTokenRecord || resetTokenRecord.consumed || new Date() > resetTokenRecord.expires_at) {
        throw new BadRequestException('Reset token has already been used or has expired');
      }

      const admin = await manager.findOne(Admin, {
        where: { admin_id: payload.sub },
      });

      if (!admin) {
        throw new BadRequestException('Admin account not found');
      }

      const adminEmail = (admin.email || admin.username).trim().toLowerCase();
      if (adminEmail !== normEmail) {
        throw new BadRequestException('Reset token does not match email');
      }

      // Mark reset token consumed
      resetTokenRecord.consumed = true;
      resetTokenRecord.consumed_at = new Date();
      await manager.save(resetTokenRecord);

      // Update admin password, increment token_version (invalidating active JWTs)
      admin.password_hash = newPasswordHash;
      admin.token_version = (admin.token_version || 1) + 1;
      if (!admin.email) {
        admin.email = normEmail;
      }
      await manager.save(admin);

      // Invalidate all pending/sent challenges for this admin
      await manager
        .createQueryBuilder()
        .update(AuthChallenge)
        .set({ status: ChallengeStatus.INVALIDATED })
        .where('admin_id = :adminId', { adminId: admin.admin_id })
        .andWhere('status IN (:...statuses)', {
          statuses: [ChallengeStatus.PENDING, ChallengeStatus.SENT],
        })
        .execute();
    });

    return {
      success: true,
      message: 'Password has been reset successfully',
    };
  }
}
