import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { createPrismaClient } from '@bizzres/database';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';

test('business and experience draft management authorization', async (t) => {
  const db = createPrismaClient(process.env.DATABASE_URL || '');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const mark = randomUUID().replaceAll('-', '');
  const userIds = [],
    organizationIds = [];
  let checks = 0;
  const request = async (path, { method = 'GET', token, body } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await globalThis.fetch(`${base}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const register = async (label) => {
    const result = await request('/auth/register', {
      method: 'POST',
      body: {
        email: `${label}.${mark}@example.com`,
        password: 'correct horse battery staple',
      },
    });
    assert.equal(result.status, 201);
    userIds.push(result.body.user.id);
    return result;
  };
  const onboard = async (account, label) => {
    const result = await request('/organizations', {
      method: 'POST',
      token: account.body.accessToken,
      body: {
        organizationName: label,
        business: {
          name: label,
          slug: `${label.toLowerCase()}-${mark}`,
          timezone: 'Africa/Tunis',
          defaultCurrency: 'TND',
        },
      },
    });
    assert.equal(result.status, 201);
    organizationIds.push(result.body.organization.id);
    return result.body;
  };
  const businessInput = (slug) => ({
    name: ' The Spin ',
    slug: ` ${slug.toUpperCase()} `,
    description: ' music ',
    timezone: 'Europe/Paris',
    defaultCurrency: ' eur ',
  });
  const experienceInput = (slug, extra = {}) => ({
    slug,
    name: ' Vinyl Session ',
    description: ' listening ',
    cancellationTerms: ' 24 hours ',
    ...extra,
  });

  t.after(async () => {
    await db.reservationAnswer.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.fieldOption.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.fieldDefinition.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.experienceRevision.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.experience.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.business.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.organizationMember.deleteMany({
      where: { organizationId: { in: organizationIds } },
    });
    await db.organization.deleteMany({
      where: { id: { in: organizationIds } },
    });
    await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await db.passwordCredential.deleteMany({
      where: { userId: { in: userIds } },
    });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
    await db.$disconnect();
  });

  assert.equal(
    (await request(`/organizations/${randomUUID()}/businesses`)).status,
    401,
  );
  assert.equal((await request(`/businesses/${randomUUID()}`)).status, 401);
  assert.equal(
    (await request(`/businesses/${randomUUID()}/experiences`)).status,
    401,
  );
  checks += 3;

  const owner = await register('owner');
  const tenant = await onboard(owner, 'Owner');
  const other = await register('other');
  const otherTenant = await onboard(other, 'Other');
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}`, {
        token: other.body.accessToken,
      })
    ).status,
    404,
  );
  checks++;

  const staff = await register('staff');
  const staffMembership = await db.organizationMember.create({
    data: {
      organizationId: tenant.organization.id,
      userId: staff.body.user.id,
      role: 'STAFF',
    },
  });
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}`, {
        token: staff.body.accessToken,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/organizations/${tenant.organization.id}/businesses`, {
        method: 'POST',
        token: staff.body.accessToken,
        body: businessInput(`staff-${mark}`),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}`, {
        method: 'PATCH',
        token: staff.body.accessToken,
        body: { name: 'No' },
      })
    ).status,
    403,
  );
  checks += 3;

  const manager = await register('manager');
  await db.organizationMember.create({
    data: {
      organizationId: tenant.organization.id,
      userId: manager.body.user.id,
      role: 'MANAGER',
    },
  });
  const secondSlug = `spin-${mark}`;
  const second = await request(
    `/organizations/${tenant.organization.id}/businesses`,
    {
      method: 'POST',
      token: manager.body.accessToken,
      body: businessInput(secondSlug),
    },
  );
  assert.equal(second.status, 201);
  assert.equal(second.body.slug, secondSlug);
  assert.equal(second.body.defaultCurrency, 'EUR');
  assert.equal(second.body.marketplaceVisibility, 'UNLISTED');
  assert.equal(second.body.description, 'music');
  checks += 5;
  const ownerRewards = await request(
    `/businesses/${tenant.business.id}/rewards`,
    { token: owner.body.accessToken },
  );
  assert.equal(ownerRewards.status, 200);
  assert.equal(ownerRewards.body.balance, 0);
  assert.deepEqual(ownerRewards.body.transactions, []);
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}/rewards`, {
        token: manager.body.accessToken,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}/rewards`, {
        token: staff.body.accessToken,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}/rewards`, {
        token: other.body.accessToken,
      })
    ).status,
    404,
  );
  checks += 6;
  assert.equal(
    (
      await request(`/organizations/${tenant.organization.id}/businesses`, {
        method: 'POST',
        token: owner.body.accessToken,
        body: businessInput(secondSlug),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/organizations/${tenant.organization.id}/businesses`, {
        method: 'POST',
        token: owner.body.accessToken,
        body: businessInput('admin'),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/organizations/${tenant.organization.id}/businesses`, {
        method: 'POST',
        token: owner.body.accessToken,
        body: { ...businessInput(`bad-${mark}`), timezone: 'UTC+1' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/organizations/${tenant.organization.id}/businesses`, {
        method: 'POST',
        token: owner.body.accessToken,
        body: { ...businessInput(`bad2-${mark}`), defaultCurrency: 'EU1' },
      })
    ).status,
    400,
  );
  checks += 4;

  const updated = await request(`/businesses/${second.body.id}`, {
    method: 'PATCH',
    token: owner.body.accessToken,
    body: {
      name: ' Updated ',
      slug: ` UPDATED-${mark} `,
      description: ' ',
      timezone: 'Africa/Tunis',
      defaultCurrency: ' usd ',
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.name, 'Updated');
  assert.equal(updated.body.slug, `updated-${mark}`);
  assert.equal(updated.body.description, null);
  assert.equal(updated.body.defaultCurrency, 'USD');
  assert.equal(
    (
      await request(`/businesses/${second.body.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: {},
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/businesses/${second.body.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { marketplaceVisibility: 'LISTED' },
      })
    ).status,
    400,
  );
  checks += 7;

  const expSlug = `vinyl-${mark}`;
  const created = await request(`/businesses/${second.body.id}/experiences`, {
    method: 'POST',
    token: owner.body.accessToken,
    body: experienceInput(` ${expSlug.toUpperCase()} `),
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.experience.slug, expSlug);
  assert.equal(created.body.experience.businessId, second.body.id);
  assert.equal(created.body.experience.publishedRevisionId, null);
  assert.equal(created.body.experience.acceptingReservations, false);
  assert.equal(created.body.draft.version, 1);
  assert.equal(created.body.draft.publishedAt, null);
  assert.equal(created.body.draft.priceAmount, '0.0000');
  assert.equal(created.body.draft.currency, 'USD');
  checks += 9;
  assert.equal(
    (
      await request(`/businesses/${second.body.id}/experiences`, {
        method: 'POST',
        token: owner.body.accessToken,
        body: experienceInput(expSlug),
      })
    ).status,
    409,
  );
  const otherExp = await request(
    `/businesses/${otherTenant.business.id}/experiences`,
    {
      method: 'POST',
      token: other.body.accessToken,
      body: experienceInput(expSlug, {
        priceAmount: '25.5',
        currency: ' usd ',
      }),
    },
  );
  assert.equal(otherExp.status, 201);
  assert.equal(otherExp.body.draft.priceAmount, '25.5000');
  assert.equal(otherExp.body.draft.currency, 'USD');
  for (const priceAmount of ['-1', 'NaN', '1e2', '1,2', '1.00000'])
    assert.equal(
      (
        await request(`/businesses/${second.body.id}/experiences`, {
          method: 'POST',
          token: owner.body.accessToken,
          body: experienceInput(`bad-${randomUUID()}`, { priceAmount }),
        })
      ).status,
      400,
    );
  checks += 9;

  assert.equal(
    (
      await request(`/businesses/${second.body.id}/experiences`, {
        token: other.body.accessToken,
      })
    ).status,
    404,
  );
  const field = await db.fieldDefinition.create({
    data: {
      organizationId: tenant.organization.id,
      experienceId: created.body.experience.id,
      revisionId: created.body.draft.id,
      key: 'music_style',
      label: 'Music style',
      type: 'SELECT',
      position: 0,
    },
  });
  await db.fieldOption.create({
    data: {
      organizationId: tenant.organization.id,
      experienceId: created.body.experience.id,
      revisionId: created.body.draft.id,
      fieldDefinitionId: field.id,
      key: 'jazz',
      label: 'Jazz',
      position: 0,
    },
  });
  const list = await request(`/businesses/${second.body.id}/experiences`, {
    token: staff.body.accessToken,
  });
  assert.equal(list.status, 200);
  assert.equal(list.body.experiences.length, 1);
  assert.equal(list.body.experiences[0].draft.id, created.body.draft.id);
  const get = await request(`/experiences/${created.body.experience.id}`, {
    token: staff.body.accessToken,
  });
  assert.equal(get.status, 200);
  assert.equal(get.body.draft.id, created.body.draft.id);
  assert.equal(get.body.draft.fields[0].key, 'music_style');
  assert.equal(get.body.draft.fields[0].options[0].key, 'jazz');
  assert.equal(
    (
      await request(`/experiences/${created.body.experience.id}`, {
        token: other.body.accessToken,
      })
    ).status,
    404,
  );
  checks += 9;

  const draft = await request(
    `/experiences/${created.body.experience.id}/draft`,
    {
      method: 'PATCH',
      token: manager.body.accessToken,
      body: {
        name: ' New Name ',
        description: ' ',
        cancellationTerms: ' ',
        priceAmount: '12.34',
        currency: ' tnd ',
        paymentMode: 'DEPOSIT',
        depositAmount: '3.5',
      },
    },
  );
  assert.equal(draft.status, 200);
  assert.equal(draft.body.name, 'New Name');
  assert.equal(draft.body.description, null);
  assert.equal(draft.body.cancellationTerms, null);
  assert.equal(draft.body.priceAmount, '12.3400');
  assert.equal(draft.body.currency, 'TND');
  assert.equal(draft.body.paymentMode, 'DEPOSIT');
  assert.equal(draft.body.depositAmount, '3.5000');
  assert.equal(
    (
      await request(`/experiences/${created.body.experience.id}/draft`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { depositAmount: '20' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/experiences/${created.body.experience.id}/draft`, {
        method: 'PATCH',
        token: staff.body.accessToken,
        body: { name: 'No' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/experiences/${created.body.experience.id}/draft`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: {},
      })
    ).status,
    400,
  );
  checks += 11;

  const newSlug = `new-${mark}`;
  assert.equal(
    (
      await request(`/experiences/${created.body.experience.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { slug: newSlug },
      })
    ).body.slug,
    newSlug,
  );
  const sibling = await request(`/businesses/${second.body.id}/experiences`, {
    method: 'POST',
    token: owner.body.accessToken,
    body: experienceInput(`sibling-${mark}`),
  });
  assert.equal(sibling.status, 201);
  assert.equal(
    (
      await request(`/experiences/${created.body.experience.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { slug: sibling.body.experience.slug },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/experiences/${created.body.experience.id}`, {
        method: 'PATCH',
        token: staff.body.accessToken,
        body: { slug: `staff-${mark}` },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/experiences/${created.body.experience.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { acceptingReservations: true },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/experiences/${created.body.experience.id}`, {
        method: 'PATCH',
        token: other.body.accessToken,
        body: { slug: `cross-${mark}` },
      })
    ).status,
    404,
  );
  checks += 6;

  const noDraft = await db.experience.create({
    data: {
      organizationId: otherTenant.organization.id,
      businessId: otherTenant.business.id,
      slug: `no-draft-${mark}`,
    },
  });
  assert.equal(
    (
      await request(`/experiences/${noDraft.id}/draft`, {
        method: 'PATCH',
        token: other.body.accessToken,
        body: { name: 'No draft' },
      })
    ).status,
    409,
  );
  await db.experience.update({
    where: { id: sibling.body.experience.id },
    data: { archivedAt: new Date() },
  });
  const afterArchive = await request(
    `/businesses/${second.body.id}/experiences`,
    { token: owner.body.accessToken },
  );
  assert.equal(
    afterArchive.body.experiences.some(
      (item) => item.id === sibling.body.experience.id,
    ),
    false,
  );
  checks += 2;

  await db.organizationMember.update({
    where: { id: staffMembership.id },
    data: { active: false },
  });
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}`, {
        token: staff.body.accessToken,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}`, {
        method: 'PATCH',
        token: staff.body.accessToken,
        body: { name: 'Still no access' },
      })
    ).status,
    404,
  );
  await db.business.update({
    where: { id: second.body.id },
    data: { archivedAt: new Date() },
  });
  const businesses = await request(
    `/organizations/${tenant.organization.id}/businesses`,
    { token: owner.body.accessToken },
  );
  assert.equal(businesses.status, 200);
  assert.equal(
    businesses.body.businesses.some((item) => item.id === second.body.id),
    false,
  );
  checks += 4;

  process.stdout.write(`PASS: ${checks} business/experience cases.\n`);
});
