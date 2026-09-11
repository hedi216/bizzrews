import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

const SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

export interface RefreshMaterial {
  sessionId: string;
  token: string;
  hash: string;
}

export function hashRefreshSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

export function createRefreshMaterial(
  sessionId: string = randomUUID(),
): RefreshMaterial {
  const secret = randomBytes(32).toString('base64url');
  return {
    sessionId,
    token: `${sessionId}.${secret}`,
    hash: hashRefreshSecret(secret),
  };
}

export function parseRefreshToken(
  token: string | undefined,
): { sessionId: string; secret: string } | null {
  if (!token) return null;
  const separator = token.indexOf('.');
  if (separator < 0 || token.indexOf('.', separator + 1) >= 0) return null;
  const sessionId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  return SESSION_ID.test(sessionId) && SECRET.test(secret)
    ? { sessionId, secret }
    : null;
}

export function refreshHashMatches(
  storedHash: string,
  secret: string,
): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashRefreshSecret(secret), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
