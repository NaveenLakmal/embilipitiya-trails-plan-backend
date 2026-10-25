import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

interface RateLimitRecord {
  timestamps: number[];
  blockedUntil?: number;
}

@Injectable()
export class RateLimiterService {
  private records = new Map<string, RateLimitRecord>();

  /**
   * Check and record an action. If rate limit exceeded, throws 429 HttpException.
   */
  checkRateLimit(key: string, maxAttempts: number, windowMs: number, blockDurationMs = windowMs): void {
    const now = Date.now();
    const record = this.records.get(key) || { timestamps: [] };

    if (record.blockedUntil && record.blockedUntil > now) {
      const waitSeconds = Math.ceil((record.blockedUntil - now) / 1000);
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many attempts. Please try again in ${waitSeconds} seconds.`,
          retry_after_seconds: waitSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Filter out old timestamps outside window
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

    if (record.timestamps.length >= maxAttempts) {
      record.blockedUntil = now + blockDurationMs;
      this.records.set(key, record);
      const waitSeconds = Math.ceil(blockDurationMs / 1000);
      throw new HttpException(
        {
          success: false,
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many attempts. Rate limit exceeded. Please wait ${waitSeconds} seconds.`,
          retry_after_seconds: waitSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.timestamps.push(now);
    this.records.set(key, record);

    // Periodic cleanup if map grows
    if (this.records.size > 5000) {
      this.cleanup(now);
    }
  }

  reset(key: string): void {
    this.records.delete(key);
  }

  private cleanup(now: number): void {
    for (const [k, rec] of this.records.entries()) {
      if ((!rec.blockedUntil || rec.blockedUntil < now) && rec.timestamps.every((t) => now - t > 3600000)) {
        this.records.delete(k);
      }
    }
  }
}
