import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from '../admin.entity';

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(Admin)
    private readonly adminRepo: Repository<Admin>,
  ) {}

  private get jwtAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
    if (!secret) {
      throw new InternalServerErrorException('JWT_ACCESS_SECRET is not configured');
    }
    return secret;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Authorization header is required');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Malformed authorization header. Expected Bearer <token>');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.jwtAccessSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    // Verify token purpose: temp_token and reset_token must never be accepted as access_token
    if (payload.purpose !== 'admin_access') {
      throw new UnauthorizedException('Invalid token purpose for this operation');
    }

    if (payload.role !== 'admin') {
      throw new ForbiddenException('Admin role required');
    }

    const admin = await this.adminRepo.findOne({
      where: { admin_id: payload.sub },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin account does not exist or has been removed');
    }

    // Check token version to ensure password changes invalidate prior tokens
    if (admin.token_version !== payload.token_version) {
      throw new UnauthorizedException('Session expired due to a recent password change. Please log in again.');
    }

    // Attach admin identity to request
    request.user = admin;
    request.admin = admin;

    return true;
  }
}
