import {
  ConflictException,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import type { AccessTokenClaims, PublicUser } from './auth.types';
import { normalizeEmailAddress } from './email';
import {
  createRefreshMaterial,
  parseRefreshToken,
  refreshHashMatches,
} from './refresh-token';
import { hashPassword, verifyPassword } from './password';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';

interface SessionResult {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface AuthenticationResult extends SessionResult {
  user: PublicUser;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyPasswordHash = '';

  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await hashPassword(
      'BizzRes timing-only dummy password',
    );
  }

  async register(input: RegisterDto): Promise<AuthenticationResult> {
    const { email, normalizedEmail } = normalizeEmailAddress(input.email);
    const passwordHash = await hashPassword(input.password);
    const material = createRefreshMaterial();
    const expiresAt = this.refreshExpiry();
    try {
      const user = await this.database.client.$transaction(
        async (transaction) => {
          const created = await transaction.user.create({
            data: {
              email,
              normalizedEmail,
              displayName: input.displayName ?? null,
            },
            select: { id: true, email: true, displayName: true },
          });
          await transaction.passwordCredential.create({
            data: { userId: created.id, passwordHash },
          });
          await transaction.authSession.create({
            data: {
              id: material.sessionId,
              userId: created.id,
              refreshTokenHash: material.hash,
              expiresAt,
            },
          });
          return created;
        },
      );
      return {
        ...(await this.issueSession(
          user.id,
          material.sessionId,
          material.token,
          expiresAt,
        )),
        user,
      };
    } catch (error) {
      if (this.isUniqueViolation(error))
        throw new ConflictException(
          'An account with this email already exists.',
        );
      throw error;
    }
  }

  async login(input: LoginDto): Promise<AuthenticationResult> {
    const { normalizedEmail } = normalizeEmailAddress(input.email);
    const user = await this.database.client.user.findUnique({
      where: { normalizedEmail },
      include: { passwordCredential: true },
    });
    const hash =
      user?.passwordCredential?.passwordHash ?? this.dummyPasswordHash;
    const valid = await verifyPassword(hash, input.password).catch(() => false);
    if (!user || !user.passwordCredential || !valid || user.disabledAt)
      this.invalidCredentials();

    const material = createRefreshMaterial();
    const expiresAt = this.refreshExpiry();
    await this.database.client.authSession.create({
      data: {
        id: material.sessionId,
        userId: user.id,
        refreshTokenHash: material.hash,
        expiresAt,
      },
    });
    return {
      ...(await this.issueSession(
        user.id,
        material.sessionId,
        material.token,
        expiresAt,
      )),
      user: { id: user.id, email: user.email, displayName: user.displayName },
    };
  }

  async refresh(rawToken: string | undefined): Promise<SessionResult> {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) this.invalidCredentials();
    const session = await this.database.client.authSession.findUnique({
      where: { id: parsed.sessionId },
      include: { user: true },
    });
    if (!session) this.invalidCredentials();
    const now = new Date();
    if (!refreshHashMatches(session.refreshTokenHash, parsed.secret)) {
      await this.revoke(session.id, now);
      this.invalidCredentials();
    }
    if (
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.disabledAt
    ) {
      if (!session.revokedAt) await this.revoke(session.id, now);
      this.invalidCredentials();
    }
    const replacement = createRefreshMaterial(session.id);
    const updated = await this.database.client.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: session.refreshTokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: { refreshTokenHash: replacement.hash, lastUsedAt: now },
    });
    if (updated.count !== 1) {
      await this.revoke(session.id, now);
      this.invalidCredentials();
    }
    return this.issueSession(
      session.userId,
      session.id,
      replacement.token,
      session.expiresAt,
    );
  }

  async logout(rawToken: string | undefined): Promise<void> {
    const parsed = parseRefreshToken(rawToken);
    if (!parsed) return;
    const session = await this.database.client.authSession.findUnique({
      where: { id: parsed.sessionId },
    });
    if (!session) return;
    const now = new Date();
    if (
      refreshHashMatches(session.refreshTokenHash, parsed.secret) ||
      !session.revokedAt
    )
      await this.revoke(session.id, now);
  }

  async currentUser(claims: AccessTokenClaims): Promise<PublicUser> {
    const user = await this.database.client.user.findFirst({
      where: { id: claims.sub, disabledAt: null },
      select: { id: true, email: true, displayName: true },
    });
    if (!user) this.invalidCredentials();
    return user;
  }

  private async issueSession(
    userId: string,
    sessionId: string,
    refreshToken: string,
    refreshExpiresAt: Date,
  ): Promise<SessionResult> {
    const payload: AccessTokenClaims = {
      sub: userId,
      sid: sessionId,
      type: 'access',
    };
    const accessToken = await this.jwt.signAsync(payload, {
      algorithm: 'HS256',
      expiresIn: this.config.accessTtlSeconds,
    });
    return {
      accessToken,
      expiresIn: this.config.accessTtlSeconds,
      refreshToken,
      refreshExpiresAt,
    };
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.refreshTtlDays * 86_400_000);
  }

  private async revoke(id: string, revokedAt: Date): Promise<void> {
    await this.database.client.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt },
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private invalidCredentials(): never {
    throw new UnauthorizedException('Invalid credentials.');
  }
}
