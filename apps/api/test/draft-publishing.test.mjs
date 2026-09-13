import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { createPrismaClient } from '@bizzres/database';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';

test('draft fields, publication, and revision cloning lifecycle', async (t) => {
  const db = createPrismaClient(process.env.DATABASE_URL || '');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const mark = randomUUID().replaceAll('-', '');
  const users = [];
  let organizationId;
  let checks = 0;
  const request = async (path, { method = 'GET', token, body } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await globalThis.fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };
  const register = async (label) => {
    const r = await request('/auth/register', {
      method: 'POST',
      body: {
        email: `${label}.${mark}@example.com`,
        password: 'correct horse battery staple',
      },
    });
    assert.equal(r.status, 201);
    users.push(r.body.user.id);
    return r;
  };
  t.after(async () => {
    if (organizationId) {
      await db.$executeRawUnsafe(
        'ALTER TABLE public."FieldOption" DISABLE TRIGGER bizzres_field_option_immutability',
      );
      await db.$executeRawUnsafe(
        'ALTER TABLE public."FieldDefinition" DISABLE TRIGGER bizzres_revision_field_immutability',
      );
      await db.$executeRawUnsafe(
        'ALTER TABLE public."ExperienceRevision" DISABLE TRIGGER bizzres_revision_immutability',
      );
      await db.$executeRawUnsafe(
        'ALTER TABLE public."PageBlock" DISABLE TRIGGER bizzres_page_block_immutability',
      );
      try {
        await db.experience.updateMany({
          where: { organizationId },
          data: { publishedRevisionId: null },
        });
        await db.fieldOption.deleteMany({ where: { organizationId } });
        await db.fieldDefinition.deleteMany({ where: { organizationId } });
        await db.pageBlock.deleteMany({ where: { organizationId } });
        await db.experienceRevision.deleteMany({ where: { organizationId } });
        await db.experience.deleteMany({ where: { organizationId } });
        await db.business.deleteMany({ where: { organizationId } });
        await db.organizationMember.deleteMany({ where: { organizationId } });
        await db.organization.deleteMany({ where: { id: organizationId } });
      } finally {
        await db.$executeRawUnsafe(
          'ALTER TABLE public."ExperienceRevision" ENABLE TRIGGER bizzres_revision_immutability',
        );
        await db.$executeRawUnsafe(
          'ALTER TABLE public."FieldDefinition" ENABLE TRIGGER bizzres_revision_field_immutability',
        );
        await db.$executeRawUnsafe(
          'ALTER TABLE public."FieldOption" ENABLE TRIGGER bizzres_field_option_immutability',
        );
        await db.$executeRawUnsafe(
          'ALTER TABLE public."PageBlock" ENABLE TRIGGER bizzres_page_block_immutability',
        );
      }
    }
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.passwordCredential.deleteMany({
      where: { userId: { in: users } },
    });
    await db.user.deleteMany({ where: { id: { in: users } } });
    await app.close();
    await db.$disconnect();
  });
  const owner = await register('publish-owner');
  const onboard = await request('/organizations', {
    method: 'POST',
    token: owner.body.accessToken,
    body: {
      organizationName: 'Publisher',
      business: {
        name: 'Publisher',
        slug: `publisher-${mark}`,
        timezone: 'Africa/Tunis',
        defaultCurrency: 'TND',
      },
    },
  });
  assert.equal(onboard.status, 201);
  organizationId = onboard.body.organization.id;
  const manager = await register('publish-manager'),
    staff = await register('publish-staff'),
    other = await register('publish-other');
  await db.organizationMember.createMany({
    data: [
      { organizationId, userId: manager.body.user.id, role: 'MANAGER' },
      { organizationId, userId: staff.body.user.id, role: 'STAFF' },
    ],
  });
  const made = await request(
    `/businesses/${onboard.body.business.id}/experiences`,
    {
      method: 'POST',
      token: owner.body.accessToken,
      body: {
        slug: `author-${mark}`,
        name: 'Authoring',
        priceAmount: '25',
        currency: 'TND',
      },
    },
  );
  assert.equal(made.status, 201);
  const eid = made.body.experience.id;
  const fieldPath = `/experiences/${eid}/draft/fields`;
  const blockPath = `/experiences/${eid}/draft/page-blocks`;
  assert.equal(
    (
      await request(blockPath, {
        method: 'POST',
        token: staff.body.accessToken,
        body: { type: 'TEXT', position: 0, config: { body: 'No' } },
      })
    ).status,
    403,
  );
  const block = await request(blockPath, {
    method: 'POST',
    token: owner.body.accessToken,
    body: {
      type: 'TEXT',
      position: 0,
      config: { heading: 'Welcome', body: 'A public introduction.' },
    },
  });
  assert.equal(block.status, 201);
  const formBlock = await request(blockPath, {
    method: 'POST',
    token: owner.body.accessToken,
    body: {
      type: 'FORM',
      position: 1,
      config: { heading: 'Reserve', submitLabel: 'Book this time' },
    },
  });
  assert.equal(formBlock.status, 201);
  assert.equal(
    (
      await request(blockPath, {
        method: 'POST',
        token: owner.body.accessToken,
        body: { type: 'FORM', position: 2, config: {} },
      })
    ).status,
    409,
  );
  const temporaryBlock = await request(blockPath, {
    method: 'POST',
    token: owner.body.accessToken,
    body: { type: 'TEXT', position: 2, config: { body: 'Temporary' } },
  });
  assert.equal(temporaryBlock.status, 201);
  assert.equal(
    (
      await request(`${blockPath}/${temporaryBlock.body.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { type: 'FORM', config: {} },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`${blockPath}/${temporaryBlock.body.id}`, {
        method: 'DELETE',
        token: owner.body.accessToken,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await request(`${blockPath}/${formBlock.body.id}`, {
        method: 'DELETE',
        token: owner.body.accessToken,
      })
    ).status,
    204,
  );
  checks += 6;
  assert.equal(
    (
      await request(blockPath, {
        method: 'POST',
        token: owner.body.accessToken,
        body: { type: 'TEXT', position: 1, config: { fields: [] } },
      })
    ).status,
    400,
  );
  checks += 3;
  const text = await request(fieldPath, {
    method: 'POST',
    token: owner.body.accessToken,
    body: {
      key: ' Notes ',
      label: ' Notes ',
      type: 'TEXTAREA',
      required: false,
      position: 0,
      placeholder: ' ',
      helpText: ' ',
      validation: { minLength: 0, maxLength: 500 },
    },
  });
  assert.equal(text.status, 201);
  assert.equal(text.body.key, 'notes');
  assert.equal(text.body.placeholder, null);
  assert.equal(text.body.helpText, null);
  checks += 4;
  const number = await request(fieldPath, {
    method: 'POST',
    token: manager.body.accessToken,
    body: {
      key: 'quantity_note',
      label: 'Quantity',
      type: 'NUMBER',
      required: true,
      position: 1,
      validation: { minimum: '0', maximum: '100.5', decimalPlaces: 2 },
    },
  });
  assert.equal(number.status, 201);
  checks++;
  assert.equal(
    (
      await request(fieldPath, {
        method: 'POST',
        token: staff.body.accessToken,
        body: {
          key: 'staff_key',
          label: 'No',
          type: 'TEXT',
          required: false,
          position: 2,
        },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(fieldPath, {
        method: 'POST',
        token: other.body.accessToken,
        body: {
          key: 'other_key',
          label: 'No',
          type: 'TEXT',
          required: false,
          position: 2,
        },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(fieldPath, {
        method: 'POST',
        token: owner.body.accessToken,
        body: {
          key: 'email',
          label: 'Reserved',
          type: 'TEXT',
          required: false,
          position: 2,
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(fieldPath, {
        method: 'POST',
        token: owner.body.accessToken,
        body: {
          key: 'notes',
          label: 'Duplicate',
          type: 'TEXT',
          required: false,
          position: 2,
        },
      })
    ).status,
    409,
  );
  checks += 4;
  for (const validation of [{ unknown: 1 }, { minLength: 5, maxLength: 2 }])
    assert.equal(
      (
        await request(fieldPath, {
          method: 'POST',
          token: owner.body.accessToken,
          body: {
            key: `invalid_${randomUUID().replaceAll('-', '')}`,
            label: 'Invalid',
            type: 'TEXT',
            required: false,
            position: 2,
            validation,
          },
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await request(fieldPath, {
        method: 'POST',
        token: owner.body.accessToken,
        body: {
          key: 'bad_number',
          label: 'Invalid',
          type: 'NUMBER',
          required: false,
          position: 2,
          validation: { minimum: '1e2' },
        },
      })
    ).status,
    400,
  );
  checks += 3;
  const select = await request(fieldPath, {
    method: 'POST',
    token: owner.body.accessToken,
    body: {
      key: 'meal',
      label: 'Meal',
      type: 'SELECT',
      required: true,
      position: 2,
      validation: {},
    },
  });
  assert.equal(select.status, 201);
  assert.equal(
    (
      await request(`${fieldPath}/${select.body.id}/options`, {
        method: 'POST',
        token: owner.body.accessToken,
        body: { key: 'vegetarian', label: ' Vegetarian ', position: 0 },
      })
    ).status,
    201,
  );
  const option = (
    await request(`/experiences/${eid}`, { token: owner.body.accessToken })
  ).body.draft.fields.find((f) => f.id === select.body.id).options[0];
  assert.equal(option.label, 'Vegetarian');
  assert.equal(
    (
      await request(`${fieldPath}/${select.body.id}/options`, {
        method: 'POST',
        token: owner.body.accessToken,
        body: { key: 'vegetarian', label: 'Duplicate', position: 1 },
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`${fieldPath}/${text.body.id}/options`, {
        method: 'POST',
        token: owner.body.accessToken,
        body: { key: 'x', label: 'X', position: 0 },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`${fieldPath}/${select.body.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { type: 'TEXT' },
      })
    ).status,
    409,
  );
  checks += 6;
  const optionUpdate = await request(
    `${fieldPath}/${select.body.id}/options/${option.id}`,
    {
      method: 'PATCH',
      token: manager.body.accessToken,
      body: { key: 'vegan', label: 'Vegan', position: 1 },
    },
  );
  assert.equal(optionUpdate.status, 200);
  assert.equal(optionUpdate.body.key, 'vegan');
  assert.equal(
    (
      await request(`${fieldPath}/${select.body.id}/options/${option.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: {},
      })
    ).status,
    400,
  );
  checks += 3;
  const updated = await request(`${fieldPath}/${text.body.id}`, {
    method: 'PATCH',
    token: manager.body.accessToken,
    body: {
      key: 'special_notes',
      label: 'Special notes',
      required: true,
      position: 4,
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.required, true);
  assert.equal(
    (
      await request(`${fieldPath}/${text.body.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: {},
      })
    ).status,
    400,
  );
  checks += 3;
  assert.equal(
    (
      await request(`/experiences/${eid}/publish`, {
        method: 'POST',
        token: staff.body.accessToken,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/experiences/${eid}/publish`, {
        method: 'POST',
        token: other.body.accessToken,
      })
    ).status,
    404,
  );
  const published = await request(`/experiences/${eid}/publish`, {
    method: 'POST',
    token: manager.body.accessToken,
  });
  assert.equal(published.status, 200);
  assert.equal(
    published.body.experience.publishedRevisionId,
    made.body.draft.id,
  );
  assert.equal(published.body.experience.acceptingReservations, false);
  assert.equal(published.body.publishedRevision.priceAmount, '25.0000');
  assert.ok(published.body.publishedRevision.publishedAt);
  const publicPage = await request(
    `/public/businesses/${onboard.body.business.slug}/experiences/${made.body.experience.slug}`,
  );
  assert.equal(publicPage.status, 200);
  assert.equal(publicPage.body.pageBlocks[0].config.heading, 'Welcome');
  assert.equal(
    (await request(`/marketplace?query=${encodeURIComponent('Publisher')}`))
      .body.businesses.length,
    0,
  );
  assert.equal(
    (
      await request(`/businesses/${onboard.body.business.id}/marketplace`, {
        method: 'PATCH',
        token: staff.body.accessToken,
        body: { marketplaceVisibility: 'LISTED' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/businesses/${onboard.body.business.id}/marketplace`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { marketplaceVisibility: 'LISTED' },
      })
    ).status,
    200,
  );
  const marketplace = await request('/marketplace?query=publisher');
  assert.equal(marketplace.status, 200);
  assert.equal(marketplace.body.businesses[0].slug, onboard.body.business.slug);
  assert.equal(
    marketplace.body.businesses[0].experiences[0].publishedRevision.priceAmount,
    '25.0000',
  );
  checks += 6;
  checks += 7;
  assert.equal(
    (
      await request(`/experiences/${eid}/publish`, {
        method: 'POST',
        token: owner.body.accessToken,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`${fieldPath}/${text.body.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { label: 'No' },
      })
    ).status,
    409,
  );
  checks += 2;
  assert.equal(
    (
      await request(`${blockPath}/${block.body.id}`, {
        method: 'PATCH',
        token: owner.body.accessToken,
        body: { config: { body: 'Changed' } },
      })
    ).status,
    409,
  );
  checks++;
  const concurrent = await Promise.all([
    request(`/experiences/${eid}/draft`, {
      method: 'POST',
      token: owner.body.accessToken,
    }),
    request(`/experiences/${eid}/draft`, {
      method: 'POST',
      token: owner.body.accessToken,
    }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
  const clone = concurrent.find((r) => r.status === 201).body;
  assert.equal(clone.version, 2);
  assert.notEqual(clone.id, made.body.draft.id);
  assert.equal(clone.fields.length, 3);
  assert.equal(clone.pageBlocks.length, 1);
  assert.notEqual(clone.pageBlocks[0].id, block.body.id);
  assert.equal(clone.pageBlocks[0].config.body, 'A public introduction.');
  const clonedSelect = clone.fields.find((f) => f.key === 'meal');
  assert.notEqual(clonedSelect.id, select.body.id);
  assert.equal(clonedSelect.options[0].key, 'vegan');
  assert.notEqual(clonedSelect.options[0].id, option.id);
  assert.equal(
    clone.fields.find((f) => f.key === 'special_notes').required,
    true,
  );
  checks += 11;
  const read = await request(`/experiences/${eid}`, {
    token: owner.body.accessToken,
  });
  assert.equal(read.body.publishedRevision.id, made.body.draft.id);
  assert.equal(read.body.draft.id, clone.id);
  assert.equal(
    (
      await request(`/experiences/${eid}/draft`, {
        method: 'POST',
        token: owner.body.accessToken,
      })
    ).status,
    409,
  );
  const edit = await request(`/experiences/${eid}/draft`, {
    method: 'PATCH',
    token: owner.body.accessToken,
    body: { name: 'Version Two' },
  });
  assert.equal(edit.status, 200);
  assert.equal(
    (
      await db.experienceRevision.findUnique({
        where: { id: made.body.draft.id },
      })
    ).name,
    'Authoring',
  );
  checks += 5;
  process.stdout.write(`PASS: ${checks} draft/publication cases.\n`);
});
