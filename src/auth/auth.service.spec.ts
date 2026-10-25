import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'node:crypto';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import {
  CustomerChallengePurpose,
  CustomerChallengeStatus,
} from './customer-auth-challenge.entity';

describe('AuthService', () => {
  let service: AuthService;
  let mockUserRepo: any;
  let mockChallengeRepo: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let mockMailService: any;

  const testSecrets: Record<string, string> = {
    JWT_ACCESS_SECRET: 'test-jwt-access-secret-32-chars-long!',
    JWT_CHALLENGE_SECRET: 'test-jwt-challenge-secret-32-chars!',
    OTP_HASH_SECRET: 'test-otp-hash-secret-32-chars-long!!',
  };

  const computeTestHmac = (challengeId: string, otp: string) => {
    return crypto
      .createHmac('sha256', testSecrets.OTP_HASH_SECRET!)
      .update(`${challengeId}:${otp}`)
      .digest('hex');
  };

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string, defaultValue?: any) => testSecrets[key] ?? defaultValue),
    };

    mockUserRepo = {
      findOne: vi.fn(),
      create: vi.fn((dto) => ({ ...dto, user_id: 42, token_version: 1 })),
      save: vi.fn((user) => Promise.resolve({ ...user, user_id: user.user_id ?? 42 })),
    };

    const mockQueryBuilder: any = {
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    mockChallengeRepo = {
      create: vi.fn((dto) => ({ ...dto })),
      save: vi.fn((ch) => Promise.resolve(ch)),
      findOne: vi.fn(),
      createQueryBuilder: vi.fn(() => mockQueryBuilder),
    };

    mockJwtService = {
      signAsync: vi.fn().mockImplementation((payload) => Promise.resolve(`jwt.${payload.purpose}`)),
      verifyAsync: vi.fn(),
    };

    mockMailService = {
      sendOtpEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new AuthService(
      mockUserRepo,
      mockChallengeRepo,
      mockJwtService,
      mockConfigService,
      mockMailService,
    );
  });

  describe('signUp', () => {
    it('creates new unverified customer and sends OTP', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const res = await service.signUp({
        name: 'Nimal Perera',
        email: 'nimal@example.com',
        password: 'SecurePassword123!',
      });

      expect(res.success).toBe(true);
      expect(res.email).toBe('nimal@example.com');
      expect(res.expires_in_seconds).toBe(300);
      expect(mockUserRepo.save).toHaveBeenCalled();
      expect(mockMailService.sendOtpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'nimal@example.com',
          purpose: 'signup',
        }),
      );
    });

    it('throws 409 Conflict if email is already verified', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        user_id: 42,
        email: 'nimal@example.com',
        is_email_verified: true,
      });

      await expect(
        service.signUp({
          name: 'Nimal Perera',
          email: 'nimal@example.com',
          password: 'SecurePassword123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('allows re-signup if previous signup is not yet verified', async () => {
      const existingUser = {
        user_id: 42,
        email: 'nimal@example.com',
        is_email_verified: false,
        name: 'Old Name',
      };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const res = await service.signUp({
        name: 'Nimal New Name',
        email: 'nimal@example.com',
        password: 'NewPassword123!',
      });

      expect(res.success).toBe(true);
      expect(existingUser.name).toBe('Nimal New Name');
    });
  });

  describe('verifyEmailOtp', () => {
    it('activates account and returns access token on valid OTP', async () => {
      const challengeId = 'chal-123';
      const otp = '482910';
      const otpHmac = computeTestHmac(challengeId, otp);

      mockChallengeRepo.findOne.mockResolvedValue({
        challenge_id: challengeId,
        email: 'nimal@example.com',
        purpose: CustomerChallengePurpose.SIGNUP,
        otp_hash: otpHmac,
        expires_at: new Date(Date.now() + 60000),
        consumed_at: null,
        failed_attempts: 0,
        status: CustomerChallengeStatus.SENT,
      });

      const user = {
        user_id: 42,
        name: 'Nimal Perera',
        email: 'nimal@example.com',
        is_email_verified: false,
        token_version: 1,
      };
      mockUserRepo.findOne.mockResolvedValue(user);

      const res = await service.verifyEmailOtp({
        email: 'nimal@example.com',
        code: '482910',
      });

      expect(res.success).toBe(true);
      expect(res.user.is_email_verified).toBe(true);
      expect(res.access_token).toBe('jwt.customer_access');
    });

    it('throws 400 Bad Request on invalid OTP code', async () => {
      const challengeId = 'chal-123';
      const otp = '482910';
      const otpHmac = computeTestHmac(challengeId, otp);

      mockChallengeRepo.findOne.mockResolvedValue({
        challenge_id: challengeId,
        email: 'nimal@example.com',
        purpose: CustomerChallengePurpose.SIGNUP,
        otp_hash: otpHmac,
        expires_at: new Date(Date.now() + 60000),
        consumed_at: null,
        failed_attempts: 0,
        status: CustomerChallengeStatus.SENT,
      });

      await expect(
        service.verifyEmailOtp({
          email: 'nimal@example.com',
          code: '000000',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendOtp', () => {
    it('throws 429 Too Many Requests if within 30s cooldown', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        user_id: 42,
        email: 'nimal@example.com',
        is_email_verified: false,
      });

      mockChallengeRepo.findOne.mockResolvedValue({
        last_sent_at: new Date(Date.now() - 10000), // 10s ago
      });

      await expect(
        service.resendOtp({
          email: 'nimal@example.com',
          purpose: 'signup',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('resends code after cooldown has passed', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        user_id: 42,
        email: 'nimal@example.com',
        is_email_verified: false,
      });

      mockChallengeRepo.findOne.mockResolvedValue({
        last_sent_at: new Date(Date.now() - 35000), // 35s ago
      });

      const res = await service.resendOtp({
        email: 'nimal@example.com',
        purpose: 'signup',
      });

      expect(res.success).toBe(true);
      expect(res.cooldown_seconds).toBe(30);
    });
  });

  describe('login', () => {
    it('authenticates customer directly without 2FA OTP', async () => {
      const password = 'SecurePassword123!';
      const hash = await argon2.hash(password, { type: argon2.argon2id });

      mockUserRepo.findOne.mockResolvedValue({
        user_id: 42,
        name: 'Nimal Perera',
        email: 'nimal@example.com',
        password_hash: hash,
        is_email_verified: true,
        token_version: 1,
      });

      const res = await service.login({
        email: 'nimal@example.com',
        password,
      });

      expect(res.success).toBe(true);
      expect(res.access_token).toBe('jwt.customer_access');
      expect(res.expires_in).toBe(604800);
      expect(res.user.id).toBe(42);
    });

    it('rejects unverified user accounts', async () => {
      const password = 'SecurePassword123!';
      const hash = await argon2.hash(password, { type: argon2.argon2id });

      mockUserRepo.findOne.mockResolvedValue({
        user_id: 42,
        email: 'nimal@example.com',
        password_hash: hash,
        is_email_verified: false,
      });

      await expect(
        service.login({
          email: 'nimal@example.com',
          password,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects incorrect password', async () => {
      const hash = await argon2.hash('RightPassword', { type: argon2.argon2id });

      mockUserRepo.findOne.mockResolvedValue({
        user_id: 42,
        email: 'nimal@example.com',
        password_hash: hash,
        is_email_verified: true,
      });

      await expect(
        service.login({
          email: 'nimal@example.com',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('googleSignIn', () => {
    it('signs in or creates user using decoded Google token', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      // Create a mock base64 id_token: header.payload.signature
      const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64');
      const payload = Buffer.from(
        JSON.stringify({
          email: 'nimal.google@gmail.com',
          name: 'Nimal Google',
          picture: 'https://lh3.googleusercontent.com/avatar',
          sub: 'google-sub-123',
        }),
      ).toString('base64');
      const mockIdToken = `${header}.${payload}.mockSignature`;

      const res = await service.googleSignIn({ id_token: mockIdToken });

      expect(res.success).toBe(true);
      expect(res.user.email).toBe('nimal.google@gmail.com');
      expect(res.access_token).toBe('jwt.customer_access');
    });
  });

  describe('forgotPassword & resetPassword flow', () => {
    it('dispatches reset OTP code', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        user_id: 42,
        email: 'nimal@example.com',
      });

      const res = await service.forgotPassword({ email: 'nimal@example.com' });

      expect(res.success).toBe(true);
      expect(mockMailService.sendOtpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'nimal@example.com',
          purpose: 'customer_reset_password',
        }),
      );
    });

    it('verifies reset OTP and returns reset_token', async () => {
      const challengeId = 'chal-reset';
      const otp = '812049';
      const otpHmac = computeTestHmac(challengeId, otp);

      mockChallengeRepo.findOne.mockResolvedValue({
        challenge_id: challengeId,
        email: 'nimal@example.com',
        purpose: CustomerChallengePurpose.PASSWORD_RESET,
        otp_hash: otpHmac,
        expires_at: new Date(Date.now() + 60000),
        consumed_at: null,
        failed_attempts: 0,
        status: CustomerChallengeStatus.SENT,
      });

      mockUserRepo.findOne.mockResolvedValue({
        user_id: 42,
        email: 'nimal@example.com',
        token_version: 1,
      });

      const res = await service.verifyResetOtp({
        email: 'nimal@example.com',
        code: '812049',
      });

      expect(res.success).toBe(true);
      expect(res.reset_token).toBe('jwt.customer_password_reset');
    });

    it('updates password and increments token_version on valid reset_token', async () => {
      const user = {
        user_id: 42,
        email: 'nimal@example.com',
        password_hash: 'old_hash',
        token_version: 1,
      };

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 42,
        email: 'nimal@example.com',
        purpose: 'customer_password_reset',
        token_version: 1,
      });

      mockUserRepo.findOne.mockResolvedValue(user);

      const res = await service.resetPassword({
        email: 'nimal@example.com',
        reset_token: 'valid.token',
        new_password: 'NewSecretPassword2026!',
      });

      expect(res.success).toBe(true);
      expect(user.token_version).toBe(2);
      expect(user.password_hash).not.toBe('old_hash');
    });
  });

  describe('getProfile', () => {
    it('returns customer profile with favourites', async () => {
      mockUserRepo.findOne.mockResolvedValue({
        user_id: 42,
        name: 'Nimal Perera',
        email: 'nimal@example.com',
        favourites: [{ place_id: 1 }, { place_id: 4 }, { place_id: 7 }],
      });

      const profile = await service.getProfile(42);

      expect(profile).toEqual({
        id: 42,
        name: 'Nimal Perera',
        email: 'nimal@example.com',
        favourite_places: [1, 4, 7],
      });
    });
  });
});
