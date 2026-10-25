import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { AdminAuthService } from './admin-auth.service';
import { Admin } from './admin.entity';
import { AuthChallenge, ChallengePurpose, ChallengeStatus } from './auth-challenge.entity';
import { AuthResetToken } from './auth-reset-token.entity';

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let mockAdminRepo: any;
  let mockChallengeRepo: any;
  let mockResetTokenRepo: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockMailService: any;
  let mockRateLimiter: any;
  let mockDataSource: any;

  const testSecrets: Record<string, string> = {
    JWT_ACCESS_SECRET: 'test-jwt-access-secret-32-chars-long!',
    JWT_CHALLENGE_SECRET: 'test-jwt-challenge-secret-32-chars!',
    OTP_HASH_SECRET: 'test-otp-hash-secret-32-chars-long!!',
  };

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn((key: string, defaultValue?: any) => testSecrets[key] ?? defaultValue),
    };

    mockAdminRepo = {
      createQueryBuilder: vi.fn(),
      findOne: vi.fn(),
      save: vi.fn(),
    };

    mockChallengeRepo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn((challenge) => Promise.resolve(challenge)),
      findOne: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    mockResetTokenRepo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn((token) => Promise.resolve(token)),
      findOne: vi.fn(),
    };

    mockJwtService = {
      signAsync: vi.fn().mockImplementation((payload) => Promise.resolve(`signed.${payload.purpose}`)),
      verifyAsync: vi.fn(),
    };

    mockMailService = {
      sendOtpEmail: vi.fn().mockResolvedValue(undefined),
    };

    mockRateLimiter = {
      checkRateLimit: vi.fn(),
      reset: vi.fn(),
    };

    mockDataSource = {
      transaction: vi.fn().mockImplementation(async (cb) => {
        const manager: any = {
          findOne: vi.fn(),
          save: vi.fn((entity) => Promise.resolve(entity)),
          createQueryBuilder: vi.fn().mockReturnValue({
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue({ affected: 1 }),
          }),
        };
        return cb(manager);
      }),
    };

    service = new AdminAuthService(
      mockAdminRepo,
      mockChallengeRepo,
      mockResetTokenRepo,
      mockJwtService,
      mockConfigService,
      mockMailService,
      mockRateLimiter,
      mockDataSource,
    );
  });

  describe('login', () => {
    it('should generate a login challenge and send email OTP on valid credentials', async () => {
      const password = 'AdminStrongPassword2026!';
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

      const admin = {
        admin_id: 1,
        email: 'admin@embitrail.lk',
        username: 'admin@embitrail.lk',
        password_hash: passwordHash,
        token_version: 1,
      };

      const qb: any = {
        where: vi.fn().mockReturnThis(),
        orWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(admin),
      };
      mockAdminRepo.createQueryBuilder.mockReturnValue(qb);

      const updateQb: any = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 0 }),
      };
      mockChallengeRepo.createQueryBuilder.mockReturnValue(updateQb);

      const result = await service.login(
        { email: 'admin@embitrail.lk', password },
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.temp_token).toBeDefined();
      expect(result.expires_in_seconds).toBe(300);
      expect(mockMailService.sendOtpEmail).toHaveBeenCalledTimes(1);
      expect(mockMailService.sendOtpEmail.mock.calls[0][0].purpose).toBe('login');
      expect(mockChallengeRepo.save).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException and NOT send email when password is wrong', async () => {
      const passwordHash = await argon2.hash('CorrectPassword2026!', { type: argon2.argon2id });
      const admin = {
        admin_id: 1,
        email: 'admin@embitrail.lk',
        password_hash: passwordHash,
      };

      const qb: any = {
        where: vi.fn().mockReturnThis(),
        orWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(admin),
      };
      mockAdminRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.login({ email: 'admin@embitrail.lk', password: 'WrongPassword' }, '127.0.0.1'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockMailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('should mark challenge as failed and not produce fake login success when SMTP fails', async () => {
      const password = 'AdminStrongPassword2026!';
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const admin = {
        admin_id: 1,
        email: 'admin@embitrail.lk',
        password_hash: passwordHash,
        token_version: 1,
      };

      const qb: any = {
        where: vi.fn().mockReturnThis(),
        orWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(admin),
      };
      mockAdminRepo.createQueryBuilder.mockReturnValue(qb);

      const updateQb: any = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 0 }),
      };
      mockChallengeRepo.createQueryBuilder.mockReturnValue(updateQb);

      mockMailService.sendOtpEmail.mockRejectedValueOnce(new Error('SMTP connection down'));

      await expect(
        service.login({ email: 'admin@embitrail.lk', password }, '127.0.0.1'),
      ).rejects.toThrow();

      // Ensure the saved challenge has status FAILED
      expect(mockChallengeRepo.save).toHaveBeenCalled();
      const lastSaveCall = mockChallengeRepo.save.mock.calls[mockChallengeRepo.save.mock.calls.length - 1][0];
      expect(lastSaveCall.status).toBe(ChallengeStatus.FAILED);
    });
  });

  describe('verifyOtp', () => {
    it('should issue access token on correct OTP verification', async () => {
      const challengeId = 'ch-uuid-1';
      const otp = '123456';
      const otpHmac = crypto
        .createHmac('sha256', testSecrets.OTP_HASH_SECRET)
        .update(`${challengeId}:${otp}`)
        .digest('hex');

      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: 1,
        challenge_id: challengeId,
        purpose: 'login_challenge',
      });

      mockAdminRepo.findOne.mockResolvedValueOnce({
        admin_id: 1,
        email: 'admin@embitrail.lk',
        token_version: 1,
      });

      const challenge = {
        challenge_id: challengeId,
        admin_id: 1,
        purpose: ChallengePurpose.LOGIN,
        otp_hash: otpHmac,
        expires_at: new Date(Date.now() + 60000),
        failed_attempts: 0,
        status: ChallengeStatus.SENT,
      };
      mockChallengeRepo.findOne.mockResolvedValueOnce(challenge);

      const updateQb: any = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 1 }),
      };
      mockChallengeRepo.createQueryBuilder.mockReturnValue(updateQb);

      const result = await service.verifyOtp(
        { email: 'admin@embitrail.lk', otp, temp_token: 'valid.temp_token' },
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.access_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.admin.id).toBe(1);
    });

    it('should increment failed attempts and reject on incorrect OTP', async () => {
      const challengeId = 'ch-uuid-2';
      const correctOtp = '654321';
      const otpHmac = crypto
        .createHmac('sha256', testSecrets.OTP_HASH_SECRET)
        .update(`${challengeId}:${correctOtp}`)
        .digest('hex');

      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: 1,
        challenge_id: challengeId,
        purpose: 'login_challenge',
      });

      mockAdminRepo.findOne.mockResolvedValueOnce({
        admin_id: 1,
        email: 'admin@embitrail.lk',
      });

      const challenge = {
        challenge_id: challengeId,
        admin_id: 1,
        purpose: ChallengePurpose.LOGIN,
        otp_hash: otpHmac,
        expires_at: new Date(Date.now() + 60000),
        failed_attempts: 2,
        status: ChallengeStatus.SENT,
      };
      mockChallengeRepo.findOne.mockResolvedValueOnce(challenge);

      await expect(
        service.verifyOtp(
          { email: 'admin@embitrail.lk', otp: '000000', temp_token: 'valid.temp_token' },
          '127.0.0.1',
        ),
      ).rejects.toThrow(BadRequestException);

      expect(challenge.failed_attempts).toBe(3);
      expect(mockChallengeRepo.save).toHaveBeenCalledWith(challenge);
    });

    it('should reject expired OTP challenge', async () => {
      const challengeId = 'ch-uuid-expired';
      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: 1,
        challenge_id: challengeId,
        purpose: 'login_challenge',
      });

      mockAdminRepo.findOne.mockResolvedValueOnce({
        admin_id: 1,
        email: 'admin@embitrail.lk',
      });

      const challenge = {
        challenge_id: challengeId,
        admin_id: 1,
        purpose: ChallengePurpose.LOGIN,
        expires_at: new Date(Date.now() - 10000), // Expired
        failed_attempts: 0,
        status: ChallengeStatus.SENT,
      };
      mockChallengeRepo.findOne.mockResolvedValueOnce(challenge);

      await expect(
        service.verifyOtp(
          { email: 'admin@embitrail.lk', otp: '123456', temp_token: 'valid.temp_token' },
          '127.0.0.1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if challenge was already consumed (concurrency protection)', async () => {
      const challengeId = 'ch-uuid-consumed';
      const otp = '123456';
      const otpHmac = crypto
        .createHmac('sha256', testSecrets.OTP_HASH_SECRET)
        .update(`${challengeId}:${otp}`)
        .digest('hex');

      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: 1,
        challenge_id: challengeId,
        purpose: 'login_challenge',
      });

      mockAdminRepo.findOne.mockResolvedValueOnce({
        admin_id: 1,
        email: 'admin@embitrail.lk',
      });

      const challenge = {
        challenge_id: challengeId,
        admin_id: 1,
        purpose: ChallengePurpose.LOGIN,
        otp_hash: otpHmac,
        expires_at: new Date(Date.now() + 60000),
        failed_attempts: 0,
        status: ChallengeStatus.SENT,
      };
      mockChallengeRepo.findOne.mockResolvedValueOnce(challenge);

      // Simulating concurrent request already consumed challenge (affected = 0)
      const updateQb: any = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 0 }),
      };
      mockChallengeRepo.createQueryBuilder.mockReturnValue(updateQb);

      await expect(
        service.verifyOtp(
          { email: 'admin@embitrail.lk', otp, temp_token: 'valid.temp_token' },
          '127.0.0.1',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendOtp', () => {
    it('should enforce 30-second cooldown on login resend', async () => {
      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: 1,
        challenge_id: 'ch-resend-1',
        purpose: 'login_challenge',
      });

      mockChallengeRepo.findOne.mockResolvedValueOnce({
        challenge_id: 'ch-resend-1',
        admin_id: 1,
        purpose: ChallengePurpose.LOGIN,
        last_sent_at: new Date(Date.now() - 10000), // 10 seconds ago (< 30s)
        failed_attempts: 0,
      });

      await expect(
        service.resendOtp(
          { email: 'admin@embitrail.lk', purpose: 'login', temp_token: 'token' },
          '127.0.0.1',
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should rotate login challenge and return updated temp_token after cooldown', async () => {
      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: 1,
        challenge_id: 'ch-resend-2',
        purpose: 'login_challenge',
      });

      mockChallengeRepo.findOne.mockResolvedValueOnce({
        challenge_id: 'ch-resend-2',
        admin_id: 1,
        purpose: ChallengePurpose.LOGIN,
        last_sent_at: new Date(Date.now() - 35000), // 35 seconds ago (> 30s)
        failed_attempts: 0,
        status: ChallengeStatus.SENT,
      });

      mockAdminRepo.findOne.mockResolvedValueOnce({
        admin_id: 1,
        email: 'admin@embitrail.lk',
      });

      const result = await service.resendOtp(
        { email: 'admin@embitrail.lk', purpose: 'login', temp_token: 'token' },
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.temp_token).toBeDefined();
      expect(result.cooldown_seconds).toBe(30);
      expect(mockMailService.sendOtpEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('password recovery flow', () => {
    it('should return generic response on forgotPassword for non-existing email without sending email', async () => {
      const qb: any = {
        where: vi.fn().mockReturnThis(),
        orWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(null),
      };
      mockAdminRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.forgotPassword(
        { email: 'nonexistent@embitrail.lk' },
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('If an administrator account exists');
      expect(mockMailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('should send recovery OTP and issue single-use reset_token on verification', async () => {
      const challengeId = 'ch-recovery-1';
      const otp = '987654';
      const otpHmac = crypto
        .createHmac('sha256', testSecrets.OTP_HASH_SECRET)
        .update(`${challengeId}:${otp}`)
        .digest('hex');

      const admin = {
        admin_id: 1,
        email: 'admin@embitrail.lk',
        token_version: 1,
      };

      const qb: any = {
        where: vi.fn().mockReturnThis(),
        orWhere: vi.fn().mockReturnThis(),
        getOne: vi.fn().mockResolvedValue(admin),
      };
      mockAdminRepo.createQueryBuilder.mockReturnValue(qb);

      mockChallengeRepo.findOne.mockResolvedValueOnce({
        challenge_id: challengeId,
        admin_id: 1,
        purpose: ChallengePurpose.RESET_PASSWORD,
        otp_hash: otpHmac,
        expires_at: new Date(Date.now() + 60000),
        failed_attempts: 0,
        status: ChallengeStatus.SENT,
      });

      const updateQb: any = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 1 }),
      };
      mockChallengeRepo.createQueryBuilder.mockReturnValue(updateQb);

      const verifyResult = await service.verifyResetOtp(
        { email: 'admin@embitrail.lk', otp },
        '127.0.0.1',
      );

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.reset_token).toBeDefined();
      expect(verifyResult.expires_in_seconds).toBe(300);
      expect(mockResetTokenRepo.save).toHaveBeenCalled();
    });

    it('should reset password, increment token_version, and invalidate reset token', async () => {
      mockJwtService.verifyAsync.mockResolvedValueOnce({
        sub: 1,
        token_id: 'reset-token-id-1',
        purpose: 'password_reset',
      });

      const existingAdmin = {
        admin_id: 1,
        email: 'admin@embitrail.lk',
        password_hash: 'old_hash',
        token_version: 1,
      };

      const resetTokenRecord = {
        token_id: 'reset-token-id-1',
        admin_id: 1,
        expires_at: new Date(Date.now() + 60000),
        consumed: false,
      };

      mockDataSource.transaction.mockImplementationOnce(async (cb) => {
        const manager: any = {
          findOne: vi.fn().mockImplementation((entityClass, query) => {
            if (entityClass === AuthResetToken) return Promise.resolve(resetTokenRecord);
            if (entityClass === Admin) return Promise.resolve(existingAdmin);
            return null;
          }),
          save: vi.fn((entity) => Promise.resolve(entity)),
          createQueryBuilder: vi.fn().mockReturnValue({
            update: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            andWhere: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue({ affected: 1 }),
          }),
        };
        return cb(manager);
      });

      const result = await service.resetPassword(
        {
          email: 'admin@embitrail.lk',
          reset_token: 'valid.reset_token',
          new_password: 'BrandNewSecurePassword2026!',
        },
        '127.0.0.1',
      );

      expect(result.success).toBe(true);
      expect(existingAdmin.token_version).toBe(2);
      expect(existingAdmin.password_hash.startsWith('$argon2')).toBe(true);
      expect(resetTokenRecord.consumed).toBe(true);
    });
  });
});
