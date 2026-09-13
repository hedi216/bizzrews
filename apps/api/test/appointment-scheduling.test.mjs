import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { createPrismaClient } from '@bizzres/database';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';

test('resource scheduling, DST slots, and generated booking concurrency', async (t) => {
  const db = createPrismaClient(process.env.DATABASE_URL || '');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const mark = randomUUID().replaceAll('-', '');
  let orgId;
  const userIds = [];
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
  const register = async (name) => {
    const r = await request('/auth/register', {
      method: 'POST',
      body: {
        email: `${name}.${mark}@example.com`,
        password: 'correct horse battery staple',
      },
    });
    assert.equal(r.status, 201);
    userIds.push(r.body.user.id);
    return r.body;
  };
  t.after(async () => {
    await app.close();
    try {
      if (orgId) {
        for (const [table, trigger] of [
          ['ReservationEvent', 'bizzres_reservation_event_append_only'],
          ['PageBlockMedia', 'bizzres_page_block_media_immutability'],
          ['PageBlock', 'bizzres_page_block_immutability'],
          ['ExperienceRevision', 'bizzres_revision_immutability'],
        ])
          await db.$executeRawUnsafe(
            `ALTER TABLE public."${table}" DISABLE TRIGGER ${trigger}`,
          );
        try {
          await db.reservationEvent.deleteMany({
            where: { organizationId: orgId },
          });
          await db.notification.deleteMany({
            where: { organizationId: orgId },
          });
          await db.reservation.deleteMany({ where: { organizationId: orgId } });
          await db.occurrence.deleteMany({ where: { organizationId: orgId } });
          await db.experience.updateMany({
            where: { organizationId: orgId },
            data: { acceptingReservations: false, publishedRevisionId: null },
          });
          await db.experienceResource.deleteMany({
            where: { organizationId: orgId },
          });
          await db.resourceAvailabilityOverride.deleteMany({
            where: { organizationId: orgId },
          });
          await db.resourceWeeklyAvailability.deleteMany({
            where: { organizationId: orgId },
          });
          await db.pageBlockMedia.deleteMany({
            where: { organizationId: orgId },
          });
          await db.pageBlock.deleteMany({ where: { organizationId: orgId } });
          await db.experienceRevision.deleteMany({
            where: { organizationId: orgId },
          });
          await db.experience.deleteMany({ where: { organizationId: orgId } });
          await db.resource.deleteMany({ where: { organizationId: orgId } });
          await db.business.deleteMany({ where: { organizationId: orgId } });
          await db.organizationMember.deleteMany({
            where: { organizationId: orgId },
          });
          await db.organization.delete({ where: { id: orgId } });
        } finally {
          await db.$executeRawUnsafe(
            'ALTER TABLE public."PageBlockMedia" ENABLE TRIGGER bizzres_page_block_media_immutability',
          );
          await db.$executeRawUnsafe(
            'ALTER TABLE public."PageBlock" ENABLE TRIGGER bizzres_page_block_immutability',
          );
          await db.$executeRawUnsafe(
            'ALTER TABLE public."ExperienceRevision" ENABLE TRIGGER bizzres_revision_immutability',
          );
          await db.$executeRawUnsafe(
            'ALTER TABLE public."ReservationEvent" ENABLE TRIGGER bizzres_reservation_event_append_only',
          );
        }
      }
      await db.authSession.deleteMany({ where: { userId: { in: userIds } } });
      await db.passwordCredential.deleteMany({
        where: { userId: { in: userIds } },
      });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
    } finally {
      await db.$disconnect();
    }
  });

  const owner = await register('scheduler');
  const onboard = await request('/organizations', {
    method: 'POST',
    token: owner.accessToken,
    body: {
      organizationName: 'Scheduler',
      business: {
        name: 'Paris Salon',
        slug: `salon-${mark}`,
        timezone: 'Europe/Paris',
        defaultCurrency: 'EUR',
      },
    },
  });
  assert.equal(onboard.status, 201);
  orgId = onboard.body.organization.id;
  const business = onboard.body.business;
  const manager = await register('scheduler-manager');
  const staff = await register('scheduler-staff');
  await db.organizationMember.createMany({
    data: [
      { organizationId: orgId, userId: manager.user.id, role: 'MANAGER' },
      { organizationId: orgId, userId: staff.user.id, role: 'STAFF' },
    ],
  });
  const made = await request(`/businesses/${business.id}/experiences`, {
    method: 'POST',
    token: owner.accessToken,
    body: { slug: `haircut-${mark}`, name: 'Haircut', currency: 'EUR' },
  });
  assert.equal(made.status, 201);
  const experienceId = made.body.experience.id;
  const resource = await request(`/businesses/${business.id}/resources`, {
    method: 'POST',
    token: owner.accessToken,
    body: { name: ' Ahmed ' },
  });
  assert.equal(resource.status, 201);
  assert.equal(resource.body.name, 'Ahmed');
  assert.equal(
    (
      await request(`/businesses/${business.id}/resources`, {
        method: 'POST',
        token: staff.accessToken,
        body: { name: 'Forbidden' },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(`/businesses/${business.id}/resources`, {
        token: staff.accessToken,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/businesses/${business.id}/resources`, {
        method: 'POST',
        token: manager.accessToken,
        body: { name: 'Sami' },
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await request(
        `/experiences/${experienceId}/resources/${resource.body.id}`,
        { method: 'POST', token: owner.accessToken },
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await request(`/resources/${resource.body.id}/weekly-availability`, {
        method: 'PUT',
        token: owner.accessToken,
        body: {
          windows: [
            { dayOfWeek: 'MONDAY', start: '09:00', end: '12:00' },
            { dayOfWeek: 'MONDAY', start: '11:00', end: '13:00' },
          ],
        },
      })
    ).status,
    400,
  );
  const weekly = await request(
    `/resources/${resource.body.id}/weekly-availability`,
    {
      method: 'PUT',
      token: owner.accessToken,
      body: {
        windows: [
          { dayOfWeek: 'MONDAY', start: '09:00', end: '12:00' },
          { dayOfWeek: 'TUESDAY', start: '14:00', end: '16:00' },
        ],
      },
    },
  );
  assert.equal(weekly.status, 200);
  assert.equal(weekly.body.windows.length, 2);
  assert.equal(
    (
      await request(`/experiences/${experienceId}/draft`, {
        method: 'PATCH',
        token: owner.accessToken,
        body: { schedulingMode: 'GENERATED_SLOTS' },
      })
    ).status,
    400,
  );
  const configured = await request(`/experiences/${experienceId}/draft`, {
    method: 'PATCH',
    token: owner.accessToken,
    body: {
      schedulingMode: 'GENERATED_SLOTS',
      durationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferBeforeMinutes: 10,
      bufferAfterMinutes: 10,
    },
  });
  assert.equal(configured.status, 200);
  assert.equal(
    (
      await request(`/experiences/${experienceId}/publish`, {
        method: 'POST',
        token: owner.accessToken,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request(`/experiences/${experienceId}/reservations/open`, {
        method: 'POST',
        token: owner.accessToken,
      })
    ).status,
    201,
  );
  const publicPath = `/public/businesses/${business.slug}/experiences/${made.body.experience.slug}`;
  const slots = await request(`${publicPath}/slots?date=2027-03-29`);
  assert.equal(slots.status, 200);
  assert.equal(slots.body.timezone, 'Europe/Paris');
  assert.equal(slots.body.slots[0].localStart, '09:30');
  assert.equal(slots.body.slots[0].startAt, '2027-03-29T07:30:00.000Z');
  assert.equal(
    (
      await request(
        `${publicPath}/slots?date=2027-03-29&resourceId=${resource.body.id}`,
      )
    ).body.slots.length,
    slots.body.slots.length,
  );
  const customOverride = await request(
    `/resources/${resource.body.id}/availability-overrides/2027-03-29`,
    {
      method: 'PUT',
      token: owner.accessToken,
      body: { available: true, start: '10:00', end: '12:00' },
    },
  );
  assert.equal(customOverride.status, 200);
  assert.equal(
    (await request(`${publicPath}/slots?date=2027-03-29`)).body.slots[0]
      .localStart,
    '10:30',
  );
  const override = await request(
    `/resources/${resource.body.id}/availability-overrides/2027-03-29`,
    { method: 'PUT', token: owner.accessToken, body: { available: false } },
  );
  assert.equal(override.status, 200);
  assert.equal(
    (await request(`${publicPath}/slots?date=2027-03-29`)).body.slots.length,
    0,
  );
  assert.equal(
    (
      await request(
        `/resources/${resource.body.id}/availability-overrides/2027-03-29`,
        { method: 'DELETE', token: owner.accessToken },
      )
    ).status,
    204,
  );
  const crossExperience = await request(
    `/businesses/${business.id}/experiences`,
    {
      method: 'POST',
      token: owner.accessToken,
      body: {
        slug: `other-service-${mark}`,
        name: 'Other service',
        currency: 'EUR',
      },
    },
  );
  assert.equal(crossExperience.status, 201);
  const conflictSlot = (await request(`${publicPath}/slots?date=2027-03-29`))
    .body.slots[1];
  const foreignOccurrence = await db.occurrence.create({
    data: {
      organizationId: orgId,
      businessId: business.id,
      experienceId: crossExperience.body.experience.id,
      resourceId: resource.body.id,
      startAt: new Date(conflictSlot.startAt),
      endAt: new Date(conflictSlot.endAt),
      timezone: 'Europe/Paris',
      capacity: 1,
    },
  });
  const crossLinked = await request(`${publicPath}/reservations`, {
    method: 'POST',
    body: {
      customer: {
        fullName: 'Cross-link check',
        phone: '+216000',
        email: 'cross-link@example.com',
      },
      booking: {
        slot: {
          resourceId: resource.body.id,
          startAt: conflictSlot.startAt,
        },
        participantCount: 1,
      },
    },
  });
  assert.equal(crossLinked.status, 409);
  assert.equal(
    await db.reservation.count({
      where: { occurrenceId: foreignOccurrence.id, experienceId },
    }),
    0,
  );
  const first = (await request(`${publicPath}/slots?date=2027-03-29`)).body
    .slots[0];
  const booking = {
    customer: {
      fullName: 'Guest',
      phone: '+216000',
      email: 'guest@example.com',
    },
    booking: {
      slot: { resourceId: resource.body.id, startAt: first.startAt },
      participantCount: 1,
    },
  };
  assert.equal(
    (
      await request(`${publicPath}/reservations`, {
        method: 'POST',
        body: {
          ...booking,
          booking: { ...booking.booking, participantCount: 2 },
        },
      })
    ).status,
    400,
  );
  const concurrent = await Promise.all([
    request(`${publicPath}/reservations`, { method: 'POST', body: booking }),
    request(`${publicPath}/reservations`, { method: 'POST', body: booking }),
  ]);
  assert.equal(
    concurrent.filter((x) => x.status === 201).length,
    1,
    JSON.stringify(concurrent),
  );
  const reservation = concurrent.find((x) => x.status === 201).body.reservation;
  const occurrence = await db.occurrence.findUnique({
    where: {
      id:
        reservation.id === undefined
          ? ''
          : (await db.reservation.findUnique({ where: { id: reservation.id } }))
              .occurrenceId,
    },
  });
  assert.equal(occurrence.resourceId, resource.body.id);
  assert.equal(occurrence.capacity, 1);
  const remaining = await request(`${publicPath}/slots?date=2027-03-29`);
  assert.ok(!remaining.body.slots.some((x) => x.startAt === first.startAt));
  assert.ok(remaining.body.slots.some((x) => x.localStart === '10:30'));
  assert.equal(
    (
      await request(`/resources/${resource.body.id}`, {
        method: 'PATCH',
        token: owner.accessToken,
        body: { active: false },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`${publicPath}/slots?date=2027-03-29`)).body.slots.length,
    0,
  );
});
