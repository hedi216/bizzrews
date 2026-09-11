import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { AccessTokenGuard } from './access-token.guard';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';
import { AuthService, type AuthenticationResult } from './auth.service';
import type { AccessTokenClaims, PublicUser } from './auth.types';
import { CurrentAuth } from './current-auth.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthRateLimit, AuthRateLimitGuard } from './rate-limit';

const REFRESH_COOKIE = 'bizzres_refresh';
type AuthResponse = Omit<
  AuthenticationResult,
  'refreshToken' | 'refreshExpiresAt'
>;

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('register')
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(5, 15 * 60_000)
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.register(input), response);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(10, 15 * 60_000)
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.respond(await this.auth.login(input), response);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthRateLimitGuard)
  @AuthRateLimit(60, 15 * 60_000)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      const result = await this.auth.refresh(this.readRefreshCookie(request));
      this.setRefreshCookie(
        response,
        result.refreshToken,
        result.refreshExpiresAt,
      );
      return { accessToken: result.accessToken, expiresIn: result.expiresIn };
    } catch (error) {
      this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(this.readRefreshCookie(request));
    this.clearRefreshCookie(response);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  me(@CurrentAuth() claims: AccessTokenClaims): Promise<PublicUser> {
    return this.auth.currentUser(claims);
  }

  private respond(
    result: AuthenticationResult,
    response: Response,
  ): AuthResponse {
    this.setRefreshCookie(
      response,
      result.refreshToken,
      result.refreshExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const value = cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: this.config.secureCookies,
      path: '/api/v1/auth',
    };
  }

  private setRefreshCookie(
    response: Response,
    token: string,
    expires: Date,
  ): void {
    response.cookie(REFRESH_COOKIE, token, {
      ...this.cookieOptions(),
      expires,
    });
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}
