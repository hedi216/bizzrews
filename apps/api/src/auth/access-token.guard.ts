import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AccessTokenClaims } from './auth.types';

export interface AuthenticatedRequest extends Request {
  auth?: AccessTokenClaims;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const [scheme, token, extra] = authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token || extra)
      throw new UnauthorizedException('Unauthorized.');
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        algorithms: ['HS256'],
      });
      if (
        payload.type !== 'access' ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string'
      )
        throw new Error();
      request.auth = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Unauthorized.');
    }
  }
}
