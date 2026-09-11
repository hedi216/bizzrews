export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export interface AuthConfig {
  accessSecret: string;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  corsOrigin: string;
  secureCookies: boolean;
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

export function loadAuthConfig(): AuthConfig {
  const accessSecret = process.env.JWT_ACCESS_SECRET?.trim();
  if (!accessSecret || Buffer.byteLength(accessSecret, 'utf8') < 32) {
    throw new Error('JWT_ACCESS_SECRET must contain at least 32 bytes.');
  }
  const corsOrigin = process.env.CORS_ORIGIN?.trim();
  if (!corsOrigin || corsOrigin === '*') {
    throw new Error('CORS_ORIGIN must be one explicit origin.');
  }
  try {
    const parsed = new URL(corsOrigin);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== corsOrigin
    ) {
      throw new Error();
    }
  } catch {
    throw new Error('CORS_ORIGIN must be a valid HTTP origin.');
  }
  return {
    accessSecret,
    accessTtlSeconds: positiveInteger('JWT_ACCESS_TTL_SECONDS', 900),
    refreshTtlDays: positiveInteger('AUTH_REFRESH_TTL_DAYS', 30),
    corsOrigin,
    secureCookies: process.env.NODE_ENV === 'production',
  };
}
