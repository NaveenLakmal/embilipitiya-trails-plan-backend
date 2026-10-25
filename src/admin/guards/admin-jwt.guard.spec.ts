import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminJwtGuard } from './admin-jwt.guard';
import { Admin } from '../admin.entity';

describe('AdminJwtGuard', () => {
  let guard: AdminJwtGuard;
  let mockJwtService: Partial<JwtService>;
  let mockConfigService: Partial<ConfigService>;
  let mockAdminRepo: any;

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

    mockAdminRepo = {
      findOne: vi.fn(),
    };

    guard = new AdminJwtGuard(
      mockJwtService as JwtService,
      mockConfigService as ConfigService,
      mockAdminRepo,
    );
  });

  function createMockContext(authHeader?: string): ExecutionContext {
    const req: any = {
      headers: authHeader !== undefined ? { authorization: authHeader } : {},
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;
  }

  it('should throw UnauthorizedException if authorization header is missing', async () => {
    const context = createMockContext();
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if header is not Bearer', async () => {
    const context = createMockContext('Basic dXNlcjpwYXNz');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if JWT verification fails', async () => {
    (mockJwtService.verifyAsync as any).mockRejectedValueOnce(new Error('jwt expired'));
    const context = createMockContext('Bearer invalid.jwt.token');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject temp_token (purpose: login_challenge) with UnauthorizedException', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 1,
      purpose: 'login_challenge',
      role: 'admin',
    });
    const context = createMockContext('Bearer temp.token.payload');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should reject reset_token (purpose: password_reset) with UnauthorizedException', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 1,
      purpose: 'password_reset',
      role: 'admin',
    });
    const context = createMockContext('Bearer reset.token.payload');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw ForbiddenException if role is not admin', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 1,
      purpose: 'admin_access',
      role: 'user',
      token_version: 1,
    });
    const context = createMockContext('Bearer user.token.payload');
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });

  it('should throw UnauthorizedException if admin no longer exists', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 1,
      purpose: 'admin_access',
      role: 'admin',
      token_version: 1,
    });
    mockAdminRepo.findOne.mockResolvedValueOnce(null);
    const context = createMockContext('Bearer valid.jwt.token');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should invalidate token when admin token_version changed (password reset)', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 1,
      purpose: 'admin_access',
      role: 'admin',
      token_version: 1, // Old token version
    });
    mockAdminRepo.findOne.mockResolvedValueOnce({
      admin_id: 1,
      email: 'admin@embitrail.lk',
      token_version: 2, // Incremented after password reset
    } as Admin);

    const context = createMockContext('Bearer valid.jwt.token');
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should allow valid admin access token and attach admin identity to request', async () => {
    (mockJwtService.verifyAsync as any).mockResolvedValueOnce({
      sub: 1,
      purpose: 'admin_access',
      role: 'admin',
      token_version: 1,
    });
    const adminEntity = {
      admin_id: 1,
      email: 'admin@embitrail.lk',
      token_version: 1,
    } as Admin;
    mockAdminRepo.findOne.mockResolvedValueOnce(adminEntity);

    const req: any = { headers: { authorization: 'Bearer valid.jwt.token' } };
    const context = {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(req.admin).toBe(adminEntity);
    expect(req.user).toBe(adminEntity);
  });
});
