import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { test } from 'node:test';
import { createPrismaClient } from '@bizzres/database';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { configureApp } from '../dist/configure-app.js';

test('transactional guest booking and business management flow', async (t) => {
  const db = createPrismaClient(process.env.DATABASE_URL || '');
  const app = await NestFactory.create(AppModule, { logger: false });
  configureApp(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  assert.equal(typeof address, 'object');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const mark = randomUUID().replaceAll('-', '');
  const userIds = [];
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
    const result = await request('/auth/register', {
      method: 'POST',
      body: {
        email: `${label}.${mark}@example.com`,
        password: 'correct horse battery staple',
      },
    });
    assert.equal(result.status, 201);
    userIds.push(result.body.user.id);
    return result.body;
  };
  t.after(async () => {
    await app.close();
    try {
      if (organizationId) {
        const disabled = [
          ['ReservationAnswer', 'bizzres_reservation_answer_append_only'],
          ['ReservationEvent', 'bizzres_reservation_event_append_only'],
          ['FieldOption', 'bizzres_field_option_immutability'],
          ['FieldDefinition', 'bizzres_revision_field_immutability'],
          ['ExperienceRevision', 'bizzres_revision_immutability'],
        ];
        for (const [table, trigger] of disabled)
          await db.$executeRawUnsafe(
            `ALTER TABLE public."${table}" DISABLE TRIGGER ${trigger}`,
          );
        try {
          await db.reservationAnswer.deleteMany({ where: { organizationId } });
          await db.reservationEvent.deleteMany({ where: { organizationId } });
          await db.reservation.deleteMany({ where: { organizationId } });
          await db.occurrence.deleteMany({ where: { organizationId } });
          await db.experience.updateMany({
            where: { organizationId },
            data: { publishedRevisionId: null, acceptingReservations: false },
          });
          await db.fieldOption.deleteMany({ where: { organizationId } });
          await db.fieldDefinition.deleteMany({ where: { organizationId } });
          await db.experienceRevision.deleteMany({ where: { organizationId } });
          await db.experience.deleteMany({ where: { organizationId } });
          await db.business.deleteMany({ where: { organizationId } });
          await db.organizationMember.deleteMany({ where: { organizationId } });
          await db.organization.delete({ where: { id: organizationId } });
        } finally {
          for (const [table, trigger] of disabled.reverse())
            await db.$executeRawUnsafe(
              `ALTER TABLE public."${table}" ENABLE TRIGGER ${trigger}`,
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

  const owner = await register('booking-owner');
  const onboard = await request('/organizations', {
    method: 'POST',
    token: owner.accessToken,
    body: {
      organizationName: 'Booking Test',
      business: {
        name: 'Booking Test',
        slug: `booking-${mark}`,
        timezone: 'Africa/Tunis',
        defaultCurrency: 'TND',
      },
    },
  });
  assert.equal(onboard.status, 201);
  organizationId = onboard.body.organization.id;
  const business = onboard.body.business;
  const made = await request(`/businesses/${business.id}/experiences`, {
    method: 'POST',
    token: owner.accessToken,
    body: {
      slug: `tour-${mark}`,
      name: 'Sahara Tour',
      priceAmount: '25',
      currency: 'TND',
    },
  });
  assert.equal(made.status, 201);
  const experienceId = made.body.experience.id;
  const field = await request(`/experiences/${experienceId}/draft/fields`, {
    method: 'POST',
    token: owner.accessToken,
    body: {
      key: 'transport',
      label: 'Transport',
      type: 'SELECT',
      required: true,
      position: 0,
    },
  });
  assert.equal(field.status, 201);
  assert.equal(
    (
      await request(`/experiences/${experienceId}/publish`, {
        method: 'POST',
        token: owner.accessToken,
      })
    ).status,
    409,
  );
  checks++;
  assert.equal(
    (
      await request(
        `/experiences/${experienceId}/draft/fields/${field.body.id}/options`,
        {
          method: 'POST',
          token: owner.accessToken,
          body: { key: 'bus', label: 'Bus', position: 0 },
        },
      )
    ).status,
    201,
  );
  const published = await request(`/experiences/${experienceId}/publish`, {
    method: 'POST',
    token: owner.accessToken,
  });
  assert.equal(published.status, 200);
  checks++;
  assert.equal(
    (
      await request(`/experiences/${experienceId}/reservations/open`, {
        method: 'POST',
        token: owner.accessToken,
      })
    ).status,
    201,
  );

  const start = new Date(Date.now() + 86_400_000).toISOString();
  const end = new Date(Date.now() + 90_000_000).toISOString();
  assert.equal(
    (
      await request(`/experiences/${experienceId}/occurrences`, {
        method: 'POST',
        token: owner.accessToken,
        body: { startAt: start.slice(0, -1), endAt: end, capacity: 1 },
      })
    ).status,
    400,
  );
  const occurrence = await request(`/experiences/${experienceId}/occurrences`, {
    method: 'POST',
    token: owner.accessToken,
    body: { startAt: start, endAt: end, capacity: 1 },
  });
  assert.equal(occurrence.status, 201);
  assert.equal(occurrence.body.timezone, 'Africa/Tunis');
  assert.equal(occurrence.body.remainingCapacity, 1);
  checks += 3;

  const publicPath = `/public/businesses/${business.slug}/experiences/${made.body.experience.slug}`;
  const publicExperience = await request(publicPath);
  assert.equal(publicExperience.status, 200);
  assert.equal(publicExperience.body.publishedRevision.priceAmount, '25.0000');
  assert.equal(publicExperience.body.fields[0].key, 'transport');
  const availability = await request(publicPath + '/occurrences');
  assert.equal(availability.status, 200);
  assert.equal(availability.body.occurrences[0].bookable, true);
  checks += 5;

  const reservationBody = {
    customer: {
      fullName: ' Guest ',
      phone: ' +216000 ',
      // Matching an account email must not claim a guest reservation.
      email: owner.user.email,
    },
    booking: { occurrenceId: occurrence.body.id, participantCount: 1 },
    answers: { transport: 'bus' },
  };
  assert.equal(
    (
      await request(publicPath + '/reservations', {
        method: 'POST',
        body: { ...reservationBody, answers: {} },
      })
    ).status,
    400,
  );
  const [one, two] = await Promise.all([
    request(publicPath + '/reservations', {
      method: 'POST',
      body: reservationBody,
    }),
    request(publicPath + '/reservations', {
      method: 'POST',
      body: reservationBody,
    }),
  ]);
  assert.deepEqual([one.status, two.status].sort(), [201, 409]);
  const reservation =
    one.status === 201 ? one.body.reservation : two.body.reservation;
  assert.equal(reservation.status, 'CONFIRMED');
  assert.equal(reservation.totalAmount, '25.0000');
  assert.equal(
    await db.reservation.count({
      where: { occurrenceId: occurrence.body.id, status: 'CONFIRMED' },
    }),
    1,
  );
  assert.equal(
    await db.reservationEvent.count({
      where: { reservationId: reservation.id, type: 'CREATED' },
    }),
    1,
  );
  checks += 6;

  assert.equal(
    (
      await db.reservation.findUnique({
        where: { id: reservation.id },
        select: { customerUserId: true },
      })
    ).customerUserId,
    null,
  );
  const secondStart = new Date(Date.now() + 172_800_000).toISOString();
  const secondEnd = new Date(Date.now() + 176_400_000).toISOString();
  const secondOccurrence = await request(
    `/experiences/${experienceId}/occurrences`,
    {
      method: 'POST',
      token: owner.accessToken,
      body: { startAt: secondStart, endAt: secondEnd, capacity: 1 },
    },
  );
  assert.equal(secondOccurrence.status, 201);
  const accountBooking = await request(publicPath + '/reservations', {
    method: 'POST',
    token: owner.accessToken,
    body: {
      ...reservationBody,
      booking: {
        occurrenceId: secondOccurrence.body.id,
        participantCount: 1,
      },
    },
  });
  assert.equal(accountBooking.status, 201);
  assert.equal(
    (
      await db.reservation.findUnique({
        where: { id: accountBooking.body.reservation.id },
        select: { customerUserId: true },
      })
    ).customerUserId,
    owner.user.id,
  );
  const history = await request('/customers/me/reservations', {
    token: owner.accessToken,
  });
  assert.equal(history.status, 200);
  assert.deepEqual(
    history.body.reservations.map((row) => row.id),
    [accountBooking.body.reservation.id],
  );
  const profile = await request('/customers/me/profile', {
    method: 'PATCH',
    token: owner.accessToken,
    body: { displayName: '  Booking Customer  ' },
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.displayName, 'Booking Customer');
  assert.equal((await request('/customers/me/reservations')).status, 401);
  assert.equal(
    (
      await request(publicPath + '/reservations', {
        method: 'POST',
        token: 'invalid',
        body: reservationBody,
      })
    ).status,
    401,
  );
  checks += 10;

  assert.equal(
    (
      await request(`/occurrences/${occurrence.body.id}`, {
        token: owner.accessToken,
      })
    ).body.remainingCapacity,
    0,
  );
  assert.equal(
    (
      await request(`/occurrences/${occurrence.body.id}`, {
        method: 'PATCH',
        token: owner.accessToken,
        body: { capacity: 2 },
      })
    ).status,
    409,
  );
  const listed = await request(`/experiences/${experienceId}/reservations`, {
    token: owner.accessToken,
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.reservations.length, 2);
  assert.equal(
    listed.body.reservations[0].answers[0].definitionSnapshot.key,
    'transport',
  );
  const cancelled = await request(`/reservations/${reservation.id}/cancel`, {
    method: 'POST',
    token: owner.accessToken,
    body: { reason: '  cancelled  ' },
  });
  assert.equal(cancelled.status, 201);
  assert.equal(cancelled.body.status, 'CANCELLED');
  assert.equal(
    await db.reservationEvent.count({
      where: { reservationId: reservation.id, type: 'CANCELLED' },
    }),
    1,
  );
  assert.equal(
    (
      await request(`/occurrences/${occurrence.body.id}`, {
        token: owner.accessToken,
      })
    ).body.remainingCapacity,
    1,
  );
  checks += 8;
  assert.equal(
    (
      await request(`/reservations/${reservation.id}/cancel`, {
        method: 'POST',
        token: owner.accessToken,
        body: {},
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/occurrences/${occurrence.body.id}/cancel`, {
        method: 'POST',
        token: owner.accessToken,
      })
    ).status,
    201,
  );
  checks += 2;
  assert.equal(checks, 36);
});
