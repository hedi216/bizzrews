import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { AccessTokenClaims } from './auth.types';
import type { AuthenticatedRequest } from './access-token.guard';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AccessTokenClaims => {
    const claims = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>().auth;
    if (!claims) throw new UnauthorizedException('Unauthorized.');
    return claims;
  },
);
