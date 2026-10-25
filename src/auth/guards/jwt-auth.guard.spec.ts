import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let mockJwtService: Partial<JwtService>;
  let mockConfigService: Partial<ConfigService>;
  let mockUserRepo: any;

  beforeEach(() => {
    mockConfigService = {
      get: vi.fn((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret-1234567890123456';
        return undefined;
      }),
    };

    mockJwtService = {
      verifyAsync: vi.fn(),
    };

    mockUserRepo = {
      findOne: vi.fn(),
    };

    guard = new JwtAuthGuard(
      mockJwtService as JwtService,
      mockConfigService as ConfigService,
      mockUserRepo,
    );
  });

  function createMockContext(authHeader?: string): { context: ExecutionContext; req: any } {
    const req: any = {
      headers: authHeader !== undefined ? { authorization: authHeader } : {},
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
    return { context, req };
  }

  it('should throw UnauthorizedException if authorization header is missing', async () => {
    const { context } = createMockContext();
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if header is not Bearer', async () => {
    const { context } = createMockContext('Basic token123');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if JWT verification fails', async () => {
    (mockJwtService.verifyAsync as any).mockRejectedValueOnce(new Error('jwt expired'));
    const { context } = createMockContext('Bearer invalid.jwt.token');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if token purpose is not customer_access', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 42,
      role: 'admin',
      purpose: 'admin_access',
    });
    const { context } = createMockContext('Bearer valid.admin.token');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if user is not found', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 42,
      role: 'customer',
      purpose: 'customer_access',
      token_version: 1,
    });
    mockUserRepo.findOne.mockResolvedValueOnce(null);
    const { context } = createMockContext('Bearer valid.customer.token');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if token_version is outdated', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 42,
      role: 'customer',
      purpose: 'customer_access',
      token_version: 1,
    });
    mockUserRepo.findOne.mockResolvedValueOnce({
      user_id: 42,
      token_version: 2,
    });
    const { context } = createMockContext('Bearer valid.customer.token');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should attach user to request and return true on valid token', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 42,
      role: 'customer',
      purpose: 'customer_access',
      token_version: 1,
    });
    const user = { user_id: 42, email: 'customer@embitrail.lk', token_version: 1 };
    mockUserRepo.findOne.mockResolvedValueOnce(user);

    const { context, req } = createMockContext('Bearer valid.customer.token');
    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.user).toBe(user);
  });
});
