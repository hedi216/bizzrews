import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

const AUTH_RATE_LIMIT = 'bizzres:auth-rate-limit';
interface RateLimit {
  limit: number;
  windowMs: number;
}
interface Counter {
  count: number;
  resetAt: number;
}

export const AuthRateLimit = (
  limit: number,
  windowMs: number,
): MethodDecorator =>
  SetMetadata(AUTH_RATE_LIMIT, { limit, windowMs } satisfies RateLimit);

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly counters = new Map<string, Counter>();
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.get<RateLimit>(
      AUTH_RATE_LIMIT,
      context.getHandler(),
    );
    if (!policy) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = `${context.getHandler().name}:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`;
    const current = this.counters.get(key);
    if (!current || current.resetAt <= now) {
      this.counters.set(key, { count: 1, resetAt: now + policy.windowMs });
      return true;
    }
    current.count += 1;
    if (current.count > policy.limit)
      throw new HttpException(
        'Too many requests.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    return true;
  }
}
