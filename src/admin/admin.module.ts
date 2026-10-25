import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Admin } from './admin.entity';
import { AuthChallenge } from './auth-challenge.entity';
import { AuthResetToken } from './auth-reset-token.entity';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import { RateLimiterService } from './rate-limiter.service';
import { AdminJwtGuard } from './guards/admin-jwt.guard';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin, AuthChallenge, AuthResetToken]),
    JwtModule.register({}),
    MailModule,
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, RateLimiterService, AdminJwtGuard],
  exports: [AdminAuthService, AdminJwtGuard, TypeOrmModule, JwtModule],
})
export class AdminModule {}
