/* global Blob, Buffer, FormData, fetch */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { createPrismaClient } from '@bizzres/database';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';

test('experience media ownership, page placement, and publication safety', async (t) => {
  const db = createPrismaClient(process.env.DATABASE_URL || '');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const mark = randomUUID().replaceAll('-', '');
  const organizations = [];
  const users = [];
  const storedKeys = [];

  const request = async (path, { method = 'GET', token, body } = {}) => {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}${path}`, {
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
    users.push(result.body.user.id);
    return result.body;
  };
  const onboard = async (account, label) => {
    const result = await request('/organizations', {
      method: 'POST',
      token: account.accessToken,
      body: {
        organizationName: label,
        business: {
          name: label,
          slug: `${label.toLowerCase().replaceAll(' ', '-')}-${mark}`,
          timezone: 'Europe/Paris',
          defaultCurrency: 'EUR',
        },
      },
    });
    assert.equal(result.status, 201);
    organizations.push(result.body.organization.id);
    return result.body;
  };
  const upload = async (businessId, token, bytes, type, name) => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    const response = await fetch(`${base}/businesses/${businessId}/media`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  };

  t.after(async () => {
    const disabled = [
      ['PageBlockMedia', 'bizzres_page_block_media_immutability'],
      ['PageBlock', 'bizzres_page_block_immutability'],
      ['ExperienceRevision', 'bizzres_revision_immutability'],
    ];
    for (const [table, trigger] of disabled)
      await db.$executeRawUnsafe(
        `ALTER TABLE public."${table}" DISABLE TRIGGER ${trigger}`,
      );
    try {
      for (const organizationId of organizations) {
        await db.experience.updateMany({
          where: { organizationId },
          data: { publishedRevisionId: null },
        });
        await db.business.updateMany({
          where: { organizationId },
          data: { logoMediaId: null },
        });
        await db.pageBlockMedia.deleteMany({ where: { organizationId } });
        await db.pageBlock.deleteMany({ where: { organizationId } });
        await db.fieldOption.deleteMany({ where: { organizationId } });
        await db.fieldDefinition.deleteMany({ where: { organizationId } });
        await db.experienceRevision.deleteMany({ where: { organizationId } });
        await db.experience.deleteMany({ where: { organizationId } });
        const media = await db.mediaAsset.findMany({
          where: { organizationId },
          select: { storageKey: true },
        });
        storedKeys.push(...media.map((item) => item.storageKey));
        await db.mediaAsset.deleteMany({ where: { organizationId } });
        await db.business.deleteMany({ where: { organizationId } });
        await db.organizationMember.deleteMany({ where: { organizationId } });
        await db.organization.deleteMany({ where: { id: organizationId } });
      }
    } finally {
      for (const [table, trigger] of disabled.reverse())
        await db.$executeRawUnsafe(
          `ALTER TABLE public."${table}" ENABLE TRIGGER ${trigger}`,
        );
    }
    await db.authSession.deleteMany({ where: { userId: { in: users } } });
    await db.passwordCredential.deleteMany({
      where: { userId: { in: users } },
    });
    await db.user.deleteMany({ where: { id: { in: users } } });
    const root = resolve(
      process.env.MEDIA_LOCAL_ROOT ?? resolve(process.cwd(), '.data', 'media'),
    );
    for (const key of storedKeys) await rm(resolve(root, key), { force: true });
    await app.close();
    await db.$disconnect();
  });

  const owner = await register('media-owner');
  const tenant = await onboard(owner, 'Media');
  const other = await register('media-other');
  const otherTenant = await onboard(other, 'Other media');
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const jpeg = Buffer.from([255, 216, 255, 0]);
  const webp = Buffer.from('RIFF0000WEBP', 'ascii');

  assert.equal(
    (await upload(tenant.business.id, undefined, png, 'image/png', 'a.png'))
      .status,
    401,
  );
  assert.equal(
    (
      await upload(
        tenant.business.id,
        owner.accessToken,
        Buffer.from('<svg/>'),
        'image/svg+xml',
        'a.svg',
      )
    ).status,
    400,
  );
  const image = await upload(
    tenant.business.id,
    owner.accessToken,
    png,
    'image/png',
    '../cover.png',
  );
  assert.equal(image.status, 201);
  assert.equal(image.body.originalName, 'cover.png');
  assert.equal(image.body.mimeType, 'image/png');
  assert.match(image.body.url, /\/public\/media\/[0-9a-f-]+$/);

  const stored = await db.mediaAsset.findUnique({
    where: { id: image.body.id },
  });
  assert.ok(stored);
  assert.match(stored.storageKey, /^[0-9a-f-]{36}\.png$/);
  assert.notEqual(stored.storageKey, image.body.originalName);
  const jpegImage = await upload(
    tenant.business.id,
    owner.accessToken,
    jpeg,
    'image/jpeg',
    'photo.jpg',
  );
  const webpImage = await upload(
    tenant.business.id,
    owner.accessToken,
    webp,
    'image/webp',
    'photo.webp',
  );
  assert.equal(jpegImage.status, 201);
  assert.equal(webpImage.status, 201);
  assert.equal(
    (
      await upload(
        tenant.business.id,
        owner.accessToken,
        new Uint8Array(8 * 1024 * 1024 + 1),
        'image/png',
        'large.png',
      )
    ).status,
    413,
  );
  const publicImage = await fetch(`${base}/public/media/${image.body.id}`);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get('content-type'), 'image/png');

  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}/logo`, {
        method: 'PATCH',
        token: other.accessToken,
        body: { mediaId: image.body.id },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}/logo`, {
        method: 'PATCH',
        token: owner.accessToken,
        body: { mediaId: image.body.id },
      })
    ).status,
    200,
  );
  const clearedLogo = await request(`/businesses/${tenant.business.id}/logo`, {
    method: 'PATCH',
    token: owner.accessToken,
    body: { mediaId: null },
  });
  assert.equal(clearedLogo.status, 200);
  assert.equal(clearedLogo.body.logoMedia, null);
  assert.equal(
    (
      await db.business.findUniqueOrThrow({
        where: { id: tenant.business.id },
        select: { logoMediaId: true },
      })
    ).logoMediaId,
    null,
  );
  assert.equal(
    (
      await request(`/businesses/${tenant.business.id}/logo`, {
        method: 'PATCH',
        token: owner.accessToken,
        body: { mediaId: image.body.id },
      })
    ).status,
    200,
  );

  const experience = await request(
    `/businesses/${tenant.business.id}/experiences`,
    {
      method: 'POST',
      token: owner.accessToken,
      body: {
        slug: `media-${mark}`,
        name: 'Media experience',
        currency: 'EUR',
      },
    },
  );
  assert.equal(experience.status, 201);
  assert.deepEqual(
    experience.body.draft.pageBlocks.map((item) => item.type),
    ['HERO', 'FORM'],
  );
  const hero = experience.body.draft.pageBlocks[0];
  const attachPath = `/experiences/${experience.body.experience.id}/draft/page-blocks/${hero.id}/media`;
  assert.equal(
    (
      await request(attachPath, {
        method: 'POST',
        token: other.accessToken,
        body: { mediaAssetId: image.body.id, position: 0 },
      })
    ).status,
    404,
  );
  const attached = await request(attachPath, {
    method: 'POST',
    token: owner.accessToken,
    body: { mediaAssetId: image.body.id, position: 0 },
  });
  assert.equal(attached.status, 201);
  assert.equal(
    (
      await request(attachPath, {
        method: 'POST',
        token: owner.accessToken,
        body: { mediaAssetId: image.body.id, position: 1 },
      })
    ).status,
    409,
  );

  const otherImage = await upload(
    otherTenant.business.id,
    other.accessToken,
    png,
    'image/png',
    'other.png',
  );
  assert.equal(otherImage.status, 201);
  assert.equal(
    (
      await request(attachPath, {
        method: 'POST',
        token: owner.accessToken,
        body: { mediaAssetId: otherImage.body.id, position: 0 },
      })
    ).status,
    409,
  );

  const gallery = await request(
    `/experiences/${experience.body.experience.id}/draft/page-blocks`,
    {
      method: 'POST',
      token: owner.accessToken,
      body: { type: 'GALLERY', position: 1, config: { heading: 'Gallery' } },
    },
  );
  assert.equal(gallery.status, 201);
  const galleryPath = `/experiences/${experience.body.experience.id}/draft/page-blocks/${gallery.body.id}/media`;
  const firstGallery = await request(galleryPath, {
    method: 'POST',
    token: owner.accessToken,
    body: { mediaAssetId: jpegImage.body.id, position: 0 },
  });
  const secondGallery = await request(galleryPath, {
    method: 'POST',
    token: owner.accessToken,
    body: { mediaAssetId: webpImage.body.id, position: 1 },
  });
  assert.equal(firstGallery.status, 201);
  assert.equal(secondGallery.status, 201);
  assert.equal(
    (
      await request(galleryPath, {
        method: 'POST',
        token: owner.accessToken,
        body: { mediaAssetId: otherImage.body.id, position: 2 },
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(`${galleryPath}/${secondGallery.body.id}`, {
        method: 'PUT',
        token: owner.accessToken,
        body: { position: 0 },
      })
    ).status,
    200,
  );

  assert.equal(
    (
      await request(`/experiences/${experience.body.experience.id}/publish`, {
        method: 'POST',
        token: owner.accessToken,
      })
    ).status,
    200,
  );
  await assert.rejects(
    () =>
      db.pageBlockMedia.update({
        where: { id: attached.body.id },
        data: { position: 2 },
      }),
    (error) => String(error.message).includes('immutable'),
  );
  await assert.rejects(
    () =>
      db.pageBlockMedia.create({
        data: {
          organizationId: tenant.organization.id,
          businessId: tenant.business.id,
          experienceId: experience.body.experience.id,
          revisionId: experience.body.draft.id,
          pageBlockId: gallery.body.id,
          mediaAssetId: image.body.id,
          position: 3,
        },
      }),
    (error) => String(error.message).includes('immutable'),
  );
  const nextDraft = await request(
    `/experiences/${experience.body.experience.id}/draft`,
    { method: 'POST', token: owner.accessToken },
  );
  assert.equal(nextDraft.status, 201);
  const clonedGallery = nextDraft.body.pageBlocks.find(
    (item) => item.type === 'GALLERY',
  );
  assert.equal(clonedGallery.media.length, 2);
  assert.notEqual(clonedGallery.id, gallery.body.id);
  assert.notEqual(clonedGallery.media[0].id, firstGallery.body.id);
  assert.deepEqual(
    clonedGallery.media.map((item) => item.mediaAsset.id).sort(),
    [jpegImage.body.id, webpImage.body.id].sort(),
  );
  await assert.rejects(
    () => db.pageBlockMedia.delete({ where: { id: attached.body.id } }),
    (error) => String(error.message).includes('immutable'),
  );
});
