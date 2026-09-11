import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { createPrismaClient } from '@bizzres/database';
import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import argon2 from 'argon2';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';

test('email/password authentication lifecycle and security controls', async (t) => {
  const database = createPrismaClient(process.env.DATABASE_URL || '');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1/auth`;
  const emailToken = randomUUID().replaceAll('-', '');
  const displayEmail = `Auth.${emailToken}@Example.com`;
  const normalizedEmail = displayEmail.toLowerCase();
  const password = 'correct horse battery staple';
  let userId;
  let checks = 0;

  const request = async (
    path,
    { body, cookie, token, method = 'POST' } = {},
  ) => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (cookie) headers.cookie = cookie;
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await globalThis.fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
      setCookie: response.headers.get('set-cookie'),
    };
  };
  const cookiePair = (header) => {
    assert.ok(header);
    return header.split(';', 1)[0];
  };
  const sessionId = (cookie) =>
    cookie.slice(cookie.indexOf('=') + 1).split('.', 1)[0];
  const createSession = async ({ expired = false, revoked = false } = {}) => {
    const id = randomUUID();
    const secret = randomBytes(32).toString('base64url');
    const createdAt = new Date(Date.now() - (expired ? 172_800_000 : 1_000));
    const expiresAt = new Date(
      Date.now() + (expired ? -86_400_000 : 86_400_000),
    );
    await database.authSession.create({
      data: {
        id,
        userId,
        refreshTokenHash: createHash('sha256').update(secret).digest('hex'),
        createdAt,
        updatedAt: createdAt,
        expiresAt,
        revokedAt: revoked ? new Date() : null,
      },
    });
    return `bizzres_refresh=${id}.${secret}`;
  };

  t.after(async () => {
    if (userId) {
      await database.authSession.deleteMany({ where: { userId } });
      await database.passwordCredential.deleteMany({ where: { userId } });
      await database.user.deleteMany({ where: { id: userId } });
    }
    await app.close();
    await database.$disconnect();
  });

  const preflight = await globalThis.fetch(`${baseUrl}/register`, {
    method: 'OPTIONS',
    headers: {
      origin: process.env.CORS_ORIGIN,
      'access-control-request-method': 'POST',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get('access-control-allow-origin'),
    process.env.CORS_ORIGIN,
  );
  assert.equal(
    preflight.headers.get('access-control-allow-credentials'),
    'true',
  );
  checks += 1;

  const registration = await request('/register', {
    body: {
      email: `  ${displayEmail}  `,
      password,
      displayName: '  Test Owner  ',
    },
  });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.expiresIn, 900);
  assert.equal(registration.body.user.email, displayEmail);
  assert.equal(registration.body.user.displayName, 'Test Owner');
  assert.ok(registration.body.accessToken);
  assert.ok(!('normalizedEmail' in registration.body.user));
  assert.match(registration.setCookie, /HttpOnly/i);
  assert.match(registration.setCookie, /SameSite=Lax/i);
  assert.match(registration.setCookie, /Path=\/api\/v1\/auth/i);
  assert.doesNotMatch(registration.setCookie, /;\s*Secure/i);
  userId = registration.body.user.id;
  const registeredCookie = cookiePair(registration.setCookie);
  checks += 1;

  const user = await database.user.findUnique({
    where: { id: userId },
    include: { passwordCredential: true, authSessions: true },
  });
  assert.equal(user.normalizedEmail, normalizedEmail);
  assert.ok(user.passwordCredential);
  assert.notEqual(user.passwordCredential.passwordHash, password);
  assert.ok(user.passwordCredential.passwordHash.startsWith('$argon2id$'));
  assert.equal(
    await argon2.verify(user.passwordCredential.passwordHash, password),
    true,
  );
  assert.equal(user.authSessions.length, 1);
  const rawRegistrationToken = registeredCookie.slice(
    registeredCookie.indexOf('=') + 1,
  );
  assert.ok(
    !user.authSessions[0].refreshTokenHash.includes(rawRegistrationToken),
  );
  checks += 1;

  const duplicate = await request('/register', {
    body: { email: displayEmail.toLowerCase(), password },
  });
  assert.equal(duplicate.status, 409);
  checks += 1;
  assert.equal(
    (
      await request('/register', {
        body: {
          email: `short.${emailToken}@example.com`,
          password: 'too short',
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/register', {
        body: {
          email: `long.${emailToken}@example.com`,
          password: 'x'.repeat(129),
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/register', {
        body: {
          email: `unknown.${emailToken}@example.com`,
          password,
          admin: true,
        },
      })
    ).status,
    400,
  );
  checks += 3;
  assert.equal(
    (
      await request('/register', {
        body: { email: `limited.${emailToken}@example.com`, password },
      })
    ).status,
    429,
  );
  checks += 1;

  const login = await request('/login', {
    body: { email: displayEmail.toUpperCase(), password },
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, userId);
  const loginCookie = cookiePair(login.setCookie);
  checks += 1;

  const wrongPassword = await request('/login', {
    body: { email: displayEmail, password: 'wrong password value' },
  });
  const unknownUser = await request('/login', {
    body: {
      email: `missing.${emailToken}@example.com`,
      password: 'wrong password value',
    },
  });
  assert.equal(wrongPassword.status, 401);
  assert.equal(unknownUser.status, 401);
  assert.equal(wrongPassword.body.message, unknownUser.body.message);
  checks += 2;

  const me = await request('/me', {
    method: 'GET',
    token: login.body.accessToken,
  });
  assert.equal(me.status, 200);
  assert.deepEqual(Object.keys(me.body).sort(), ['displayName', 'email', 'id']);
  assert.ok(!JSON.stringify(me.body).includes('Hash'));
  checks += 1;
  assert.equal((await request('/me', { method: 'GET' })).status, 401);
  assert.equal(
    (await request('/me', { method: 'GET', token: 'malformed' })).status,
    401,
  );
  checks += 2;

  const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
  const expiredAccess = jwt.sign(
    { sub: userId, sid: randomUUID(), type: 'access' },
    { algorithm: 'HS256', expiresIn: -1 },
  );
  const wrongType = jwt.sign(
    { sub: userId, sid: randomUUID(), type: 'refresh' },
    { algorithm: 'HS256', expiresIn: 60 },
  );
  assert.equal(
    (await request('/me', { method: 'GET', token: expiredAccess })).status,
    401,
  );
  assert.equal(
    (await request('/me', { method: 'GET', token: wrongType })).status,
    401,
  );
  checks += 2;

  const loginSessionId = sessionId(loginCookie);
  const beforeRefresh = await database.authSession.findUniqueOrThrow({
    where: { id: loginSessionId },
  });
  const refreshed = await request('/refresh', { cookie: loginCookie });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.accessToken);
  const rotatedCookie = cookiePair(refreshed.setCookie);
  assert.notEqual(rotatedCookie, loginCookie);
  const afterRefresh = await database.authSession.findUniqueOrThrow({
    where: { id: loginSessionId },
  });
  assert.notEqual(
    afterRefresh.refreshTokenHash,
    beforeRefresh.refreshTokenHash,
  );
  assert.ok(afterRefresh.lastUsedAt);
  checks += 1;
  assert.equal(
    (await request('/refresh', { cookie: loginCookie })).status,
    401,
  );
  assert.ok(
    (
      await database.authSession.findUniqueOrThrow({
        where: { id: loginSessionId },
      })
    ).revokedAt,
  );
  checks += 1;

  const reuseLogin = await request('/login', {
    body: { email: displayEmail, password },
  });
  const reuseCookie = cookiePair(reuseLogin.setCookie);
  const reuseId = sessionId(reuseCookie);
  const tokenValue = reuseCookie.slice(reuseCookie.indexOf('=') + 1);
  const [tokenSession, tokenSecret] = tokenValue.split('.');
  const invalidSecret = `${tokenSecret.slice(0, -1)}${tokenSecret.endsWith('A') ? 'B' : 'A'}`;
  assert.equal(
    (
      await request('/refresh', {
        cookie: `bizzres_refresh=${tokenSession}.${invalidSecret}`,
      })
    ).status,
    401,
  );
  assert.ok(
    (await database.authSession.findUniqueOrThrow({ where: { id: reuseId } }))
      .revokedAt,
  );
  checks += 1;

  assert.equal(
    (
      await request('/refresh', {
        cookie: await createSession({ expired: true }),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request('/refresh', {
        cookie: await createSession({ revoked: true }),
      })
    ).status,
    401,
  );
  checks += 2;

  const disabledLogin = await request('/login', {
    body: { email: displayEmail, password },
  });
  const disabledCookie = cookiePair(disabledLogin.setCookie);
  await database.user.update({
    where: { id: userId },
    data: { disabledAt: new Date() },
  });
  assert.equal(
    (await request('/login', { body: { email: displayEmail, password } }))
      .status,
    401,
  );
  assert.equal(
    (
      await request('/me', {
        method: 'GET',
        token: disabledLogin.body.accessToken,
      })
    ).status,
    401,
  );
  assert.equal(
    (await request('/refresh', { cookie: disabledCookie })).status,
    401,
  );
  await database.user.update({
    where: { id: userId },
    data: { disabledAt: null },
  });
  checks += 3;

  const logoutLogin = await request('/login', {
    body: { email: displayEmail, password },
  });
  const logoutCookie = cookiePair(logoutLogin.setCookie);
  const logoutId = sessionId(logoutCookie);
  const logout = await request('/logout', { cookie: logoutCookie });
  assert.equal(logout.status, 204);
  assert.match(logout.setCookie, /bizzres_refresh=;/);
  assert.ok(
    (await database.authSession.findUniqueOrThrow({ where: { id: logoutId } }))
      .revokedAt,
  );
  assert.equal(
    (await request('/logout', { cookie: logoutCookie })).status,
    204,
  );
  assert.equal(
    (await request('/refresh', { cookie: logoutCookie })).status,
    401,
  );
  checks += 3;

  process.stdout.write(`PASS: ${checks} authentication cases.\n`);
});
