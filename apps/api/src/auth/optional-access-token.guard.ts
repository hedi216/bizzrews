import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from './access-token.guard';

@Injectable()
export class OptionalAccessTokenGuard extends AccessTokenGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.headers.authorization) return true;
    return super.canActivate(context);
  }
}
