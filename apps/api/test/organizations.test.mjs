import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { createPrismaClient } from '@bizzres/database';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';

test('authenticated organization creation and listing', async (t) => {
  const database = createPrismaClient(process.env.DATABASE_URL || '');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  const marker = randomUUID().replaceAll('-', '');
  const password = 'correct horse battery staple';
  const userIds = [];
  const organizationIds = [];
  let checks = 0;

  const request = async (path, { body, token, method = 'POST' } = {}) => {
    const headers = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await globalThis.fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const register = async (name) => {
    const response = await request('/auth/register', {
      body: { email: `${name}.${marker}@example.com`, password },
    });
    assert.equal(response.status, 201);
    userIds.push(response.body.user.id);
    return response;
  };
  const payload = (slug, overrides = {}) => ({
    organizationName: '  Comeleon Studio  ',
    business: {
      name: '  Comeleon Studio  ',
      slug,
      description: '   ',
      timezone: 'Africa/Tunis',
      defaultCurrency: ' tnd ',
    },
    ...overrides,
  });

  t.after(async () => {
    await database.business.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.organizationMember.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await database.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await database.authSession.deleteMany({
      where: { userId: { in: userIds } },
    });
    await database.passwordCredential.deleteMany({
      where: { userId: { in: userIds } },
    });
    await database.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await database.$disconnect();
  });

  assert.equal((await request('/organizations')).status, 401);
  assert.equal(
    (await request('/organizations', { method: 'GET' })).status,
    401,
  );
  checks += 2;

  const disabled = await register('disabled');
  await database.user.update({
    where: { id: disabled.body.user.id },
    data: { disabledAt: new Date() },
  });
  assert.equal(
    (
      await request('/organizations', {
        token: disabled.body.accessToken,
        body: payload(`disabled-${marker}`),
      })
    ).status,
    401,
  );
  checks += 1;

  const owner = await register('owner');
  const slug = `studio-${marker}`;
  const created = await request('/organizations', {
    token: owner.body.accessToken,
    body: payload(`  ${slug.toUpperCase()}  `),
  });
  assert.equal(created.status, 201);
  organizationIds.push(created.body.organization.id);
  assert.equal(created.body.organization.name, 'Comeleon Studio');
  assert.equal(created.body.membership.role, 'OWNER');
  assert.equal(created.body.membership.active, true);
  assert.equal(created.body.business.name, 'Comeleon Studio');
  assert.equal(created.body.business.slug, slug);
  assert.equal(created.body.business.description, null);
  assert.equal(created.body.business.timezone, 'Africa/Tunis');
  assert.equal(created.body.business.defaultCurrency, 'TND');
  assert.equal(created.body.business.marketplaceVisibility, 'UNLISTED');
  assert.deepEqual(Object.keys(created.body).sort(), [
    'business',
    'membership',
    'organization',
  ]);
  const storedMembership = await database.organizationMember.findUniqueOrThrow({
    where: { id: created.body.membership.id },
  });
  assert.equal(storedMembership.userId, owner.body.user.id);
  assert.equal(storedMembership.organizationId, created.body.organization.id);
  const storedBusiness = await database.business.findUniqueOrThrow({
    where: { id: created.body.business.id },
  });
  assert.equal(storedBusiness.organizationId, created.body.organization.id);
  checks += 14;

  const invalidBodies = [
    payload(`a-${marker}`, { organizationName: '   ' }),
    {
      ...payload(`b-${marker}`),
      business: { ...payload('x').business, name: ' ' },
    },
    payload('--test'),
    payload('admin'),
    {
      ...payload(`c-${marker}`),
      business: { ...payload('x').business, timezone: 'UTC+1' },
    },
    {
      ...payload(`d-${marker}`),
      business: { ...payload('x').business, defaultCurrency: 'EU1' },
    },
    { ...payload(`e-${marker}`), userId: owner.body.user.id },
    { ...payload(`f-${marker}`), role: 'MANAGER' },
    {
      ...payload(`g-${marker}`),
      business: { ...payload('x').business, marketplaceVisibility: 'LISTED' },
    },
  ];
  for (const body of invalidBodies) {
    assert.equal(
      (await request('/organizations', { token: owner.body.accessToken, body }))
        .status,
      400,
    );
  }
  checks += invalidBodies.length;

  const beforeOrganizations = await database.organization.count();
  const beforeMemberships = await database.organizationMember.count();
  const collision = await request('/organizations', {
    token: owner.body.accessToken,
    body: payload(slug),
  });
  assert.equal(collision.status, 409);
  assert.equal(await database.organization.count(), beforeOrganizations);
  assert.equal(await database.organizationMember.count(), beforeMemberships);
  checks += 3;

  const secondSlug = `second-${marker}`;
  const second = await request('/organizations', {
    token: owner.body.accessToken,
    body: payload(secondSlug),
  });
  assert.equal(second.status, 201);
  organizationIds.push(second.body.organization.id);
  assert.equal(second.body.membership.role, 'OWNER');
  assert.notEqual(second.body.organization.id, created.body.organization.id);
  checks += 3;

  const other = await register('other');
  assert.equal(
    (
      await request('/organizations', {
        token: other.body.accessToken,
        body: payload(slug),
      })
    ).status,
    409,
  );
  const sameName = await request('/organizations', {
    token: other.body.accessToken,
    body: payload(`other-${marker}`),
  });
  assert.equal(sameName.status, 201);
  organizationIds.push(sameName.body.organization.id);
  checks += 2;

  await database.organizationMember.update({
    where: { id: second.body.membership.id },
    data: { active: false },
  });
  await database.business.update({
    where: { id: created.body.business.id },
    data: { archivedAt: new Date() },
  });
  const listed = await request('/organizations', {
    method: 'GET',
    token: owner.body.accessToken,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.organizations.length, 1);
  assert.equal(listed.body.organizations[0].id, created.body.organization.id);
  assert.equal(listed.body.organizations[0].role, 'OWNER');
  assert.equal(
    listed.body.organizations[0].membershipId,
    created.body.membership.id,
  );
  assert.deepEqual(listed.body.organizations[0].businesses, []);
  assert.equal(
    listed.body.organizations.some(
      (item) => item.id === sameName.body.organization.id,
    ),
    false,
  );
  checks += 7;

  const otherList = await request('/organizations', {
    method: 'GET',
    token: other.body.accessToken,
  });
  assert.equal(otherList.status, 200);
  assert.deepEqual(
    otherList.body.organizations.map((item) => item.id),
    [sameName.body.organization.id],
  );
  assert.equal(otherList.body.organizations[0].businesses.length, 1);
  checks += 3;

  process.stdout.write(`PASS: ${checks} organization cases.\n`);
});
