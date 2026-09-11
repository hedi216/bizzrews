import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import pg from 'pg';

// All fixture mutations run inside one transaction that is always rolled back.
// This command intentionally refuses any target other than local bizzres_dev.
const expectedTables = [
  'User',
  'Organization',
  'OrganizationMember',
  'Business',
  'Experience',
  'ExperienceRevision',
  'Occurrence',
  'Reservation',
  'ReservationEvent',
].sort();
let client;
let transaction = false;
let label = 'environment';
let passed = 0;

try {
  const url = new URL(process.env.DATABASE_URL || '');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  assert.equal(url.pathname, '/bizzres_dev');
  assert.equal(decodeURIComponent(url.username), 'bizzres_app');
  assert.equal(url.port || '5432', '5432');
  client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 3000,
  });
  await client.connect();
  const {
    rows: [identity],
  } = await client.query(
    'SELECT current_user AS username, current_database() AS database, rolsuper FROM pg_roles WHERE rolname = current_user',
  );
  assert.equal(identity.username, 'bizzres_app');
  assert.equal(identity.database, 'bizzres_dev');
  assert.equal(identity.rolsuper, false);
  const { rows: tables } = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
  );
  assert.deepEqual(
    tables.map((row) => row.tablename),
    expectedTables,
  );
  const counts = async () => {
    const entries = [];
    for (const table of expectedTables) {
      const {
        rows: [row],
      } = await client.query(
        `SELECT count(*)::int AS count FROM public."${table}"`,
      );
      entries.push([table, row.count]);
    }
    return Object.fromEntries(entries);
  };
  const before = await counts();
  await client.query('BEGIN');
  transaction = true;
  await client.query("SET LOCAL lock_timeout = '3s'");
  await client.query("SET LOCAL statement_timeout = '5s'");

  const insert = async (table, data) => {
    assert.ok(expectedTables.includes(table));
    const columns = Object.keys(data);
    assert.ok(columns.every((key) => /^[a-zA-Z]+$/.test(key)));
    return client.query(
      `INSERT INTO public."${table}" (${columns.map((key) => `"${key}"`).join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(data),
    );
  };
  const reject = async (name, operation, code, constraint) => {
    label = name;
    await client.query('SAVEPOINT integrity_case');
    let failure;
    try {
      await operation();
    } catch (error) {
      failure = error;
    }
    await client.query('ROLLBACK TO SAVEPOINT integrity_case');
    await client.query('RELEASE SAVEPOINT integrity_case');
    assert.ok(failure, `${name}: invalid write was accepted`);
    assert.equal(failure.code, code, `${name}: wrong SQLSTATE`);
    if (constraint)
      assert.equal(failure.constraint, constraint, `${name}: wrong constraint`);
    passed += 1;
    process.stdout.write(`PASS: ${name}\n`);
  };
  const now = new Date('2030-01-01T00:00:00.000Z');
  const orgA = randomUUID(),
    orgB = randomUUID();
  const user = randomUUID(),
    memberA = randomUUID(),
    memberB = randomUUID();
  const businessA = randomUUID(),
    businessB = randomUUID();
  const experienceA = randomUUID(),
    experienceB = randomUUID(),
    experienceOtherTenant = randomUUID();
  const revisionA = randomUUID(),
    revisionB = randomUUID(),
    revisionOtherTenant = randomUUID();
  const occurrenceA = randomUUID(),
    occurrenceB = randomUUID(),
    occurrenceOtherTenant = randomUUID();

  label = 'valid fixtures';
  await insert('User', {
    id: user,
    email: `${user}@example.invalid`,
    normalizedEmail: `${user}@example.invalid`,
    updatedAt: now,
  });
  for (const id of [orgA, orgB])
    await insert('Organization', {
      id,
      name: 'Rollback fixture',
      updatedAt: now,
    });
  for (const [id, organizationId] of [
    [memberA, orgA],
    [memberB, orgB],
  ]) {
    await insert('OrganizationMember', {
      id,
      organizationId,
      userId: user,
      role: 'OWNER',
      updatedAt: now,
    });
  }
  for (const [id, organizationId] of [
    [businessA, orgA],
    [businessB, orgB],
  ]) {
    await insert('Business', {
      id,
      organizationId,
      name: 'Rollback fixture',
      slug: id,
      timezone: 'Africa/Tunis',
      defaultCurrency: 'TND',
      updatedAt: now,
    });
  }
  for (const [id, organizationId, businessId] of [
    [experienceA, orgA, businessA],
    [experienceB, orgA, businessA],
    [experienceOtherTenant, orgB, businessB],
  ]) {
    await insert('Experience', {
      id,
      organizationId,
      businessId,
      slug: id,
      updatedAt: now,
    });
  }
  const revision = (extra = {}) => ({
    id: randomUUID(),
    organizationId: orgA,
    experienceId: experienceA,
    version: 2,
    name: 'Draft fixture',
    priceAmount: '12.3450',
    currency: 'TND',
    updatedAt: now,
    ...extra,
  });
  for (const [id, organizationId, experienceId] of [
    [revisionA, orgA, experienceA],
    [revisionB, orgA, experienceB],
    [revisionOtherTenant, orgB, experienceOtherTenant],
  ]) {
    await insert(
      'ExperienceRevision',
      revision({ id, organizationId, experienceId, version: 1 }),
    );
  }
  const occurrence = (extra = {}) => ({
    id: randomUUID(),
    organizationId: orgA,
    experienceId: experienceA,
    startAt: now,
    endAt: new Date('2030-01-01T01:00:00.000Z'),
    timezone: 'Africa/Tunis',
    capacity: 10,
    updatedAt: now,
    ...extra,
  });
  for (const [id, organizationId, experienceId] of [
    [occurrenceA, orgA, experienceA],
    [occurrenceB, orgA, experienceB],
    [occurrenceOtherTenant, orgB, experienceOtherTenant],
  ]) {
    await insert(
      'Occurrence',
      occurrence({ id, organizationId, experienceId }),
    );
  }
  const reservation = (extra = {}) => ({
    id: randomUUID(),
    organizationId: orgA,
    experienceId: experienceA,
    revisionId: revisionA,
    occurrenceId: occurrenceA,
    customerFullName: 'Rollback fixture',
    customerPhone: '+21620000000',
    customerEmail: 'fixture@example.invalid',
    startAt: now,
    endAt: new Date('2030-01-01T01:00:00.000Z'),
    timezone: 'Africa/Tunis',
    participantCount: 1,
    totalAmount: '12.3450',
    currency: 'TND',
    snapshotVersion: 1,
    experienceSnapshot: { name: 'Rollback fixture' },
    updatedAt: now,
    ...extra,
  });

  await reject(
    'negative revision price',
    () => insert('ExperienceRevision', revision({ priceAmount: '-1' })),
    '23514',
    'bizzres_revision_price_check',
  );
  await reject(
    'NaN revision price',
    () => insert('ExperienceRevision', revision({ priceAmount: 'NaN' })),
    '23514',
    'bizzres_revision_price_check',
  );
  for (const version of [0, -1])
    await reject(
      `revision version ${version}`,
      () => insert('ExperienceRevision', revision({ version })),
      '23514',
      'bizzres_revision_version_check',
    );
  await reject(
    'blank revision name',
    () => insert('ExperienceRevision', revision({ name: '   ' })),
    '23514',
    'bizzres_revision_name_check',
  );
  for (const currency of ['tnd', 'TN', 'T1D'])
    await reject(
      `revision currency ${currency}`,
      () => insert('ExperienceRevision', revision({ currency })),
      '23514',
      'bizzres_revision_currency_check',
    );
  for (const capacity of [0, -1])
    await reject(
      `occurrence capacity ${capacity}`,
      () => insert('Occurrence', occurrence({ capacity })),
      '23514',
      'bizzres_occurrence_capacity_check',
    );
  for (const endAt of [now, new Date('2029-12-31T23:00:00.000Z')])
    await reject(
      'occurrence nonpositive interval',
      () => insert('Occurrence', occurrence({ endAt })),
      '23514',
      'bizzres_occurrence_interval_check',
    );
  for (const participantCount of [0, -1])
    await reject(
      `reservation participants ${participantCount}`,
      () => insert('Reservation', reservation({ participantCount })),
      '23514',
      'bizzres_reservation_participants_check',
    );
  for (const endAt of [now, new Date('2029-12-31T23:00:00.000Z')])
    await reject(
      'reservation nonpositive interval',
      () => insert('Reservation', reservation({ endAt })),
      '23514',
      'bizzres_reservation_interval_check',
    );
  for (const totalAmount of ['-1', 'NaN'])
    await reject(
      `reservation total ${totalAmount}`,
      () => insert('Reservation', reservation({ totalAmount })),
      '23514',
      'bizzres_reservation_amount_check',
    );
  for (const [field, constraint] of [
    ['customerFullName', 'bizzres_reservation_name_check'],
    ['customerPhone', 'bizzres_reservation_phone_check'],
    ['customerEmail', 'bizzres_reservation_email_check'],
  ]) {
    await reject(
      `blank ${field}`,
      () => insert('Reservation', reservation({ [field]: '   ' })),
      '23514',
      constraint,
    );
  }
  for (const currency of ['tnd', 'TN', 'T1D'])
    await reject(
      `reservation currency ${currency}`,
      () => insert('Reservation', reservation({ currency })),
      '23514',
      'bizzres_reservation_currency_check',
    );
  for (const snapshotVersion of [0, -1])
    await reject(
      `snapshot version ${snapshotVersion}`,
      () => insert('Reservation', reservation({ snapshotVersion })),
      '23514',
      'bizzres_reservation_snapshot_version_check',
    );
  for (const extra of [
    { cancelledAt: now },
    { cancellationReason: 'invalid' },
    { status: 'CANCELLED' },
  ]) {
    await reject(
      'reservation cancellation consistency',
      () => insert('Reservation', reservation(extra)),
      '23514',
      'bizzres_reservation_status_check',
    );
  }
  await reject(
    'cross-tenant business reference',
    () =>
      insert('Experience', {
        id: randomUUID(),
        organizationId: orgA,
        businessId: businessB,
        slug: randomUUID(),
        updatedAt: now,
      }),
    '23503',
  );
  await reject(
    'cross-experience reservation revision',
    () => insert('Reservation', reservation({ revisionId: revisionB })),
    '23503',
  );
  await reject(
    'cross-experience reservation occurrence',
    () => insert('Reservation', reservation({ occurrenceId: occurrenceB })),
    '23503',
  );
  await reject(
    'cross-tenant reservation revision',
    () =>
      insert('Reservation', reservation({ revisionId: revisionOtherTenant })),
    '23503',
  );
  await reject(
    'cross-tenant reservation occurrence',
    () =>
      insert(
        'Reservation',
        reservation({ occurrenceId: occurrenceOtherTenant }),
      ),
    '23503',
  );
  await reject(
    'publishing a draft',
    () =>
      client.query(
        'UPDATE public."Experience" SET "publishedRevisionId"=$1 WHERE id=$2',
        [revisionA, experienceA],
      ),
    '23514',
    'bizzres_publication_requires_published_revision',
  );

  label = 'valid draft edit and first publication';
  await client.query(
    'UPDATE public."ExperienceRevision" SET name=$1, "updatedAt"=$2 WHERE id=$3',
    ['Edited draft', now, revisionA],
  );
  await client.query(
    'UPDATE public."ExperienceRevision" SET "publishedAt"=$1, "updatedAt"=$1 WHERE id=$2',
    [now, revisionA],
  );
  await client.query(
    'UPDATE public."Experience" SET "publishedRevisionId"=$1, "acceptingReservations"=true WHERE id=$2',
    [revisionA, experienceA],
  );
  passed += 1;
  process.stdout.write(`PASS: ${label}\n`);
  await reject(
    'cross-experience publication pointer',
    () =>
      client.query(
        'UPDATE public."Experience" SET "publishedRevisionId"=$1 WHERE id=$2',
        [revisionA, experienceB],
      ),
    '23503',
  );
  await reject(
    'cross-tenant publication pointer',
    () =>
      client.query(
        'UPDATE public."Experience" SET "publishedRevisionId"=$1 WHERE id=$2',
        [revisionA, experienceOtherTenant],
      ),
    '23503',
  );
  for (const [field, value] of [
    ['name', 'Changed'],
    ['priceAmount', '9'],
    ['version', 3],
    ['description', 'Changed'],
    ['cancellationTerms', 'Changed'],
    ['currency', 'EUR'],
    ['publishedAt', null],
    ['organizationId', orgB],
    ['experienceId', experienceB],
    ['updatedAt', new Date('2030-01-02T00:00:00Z')],
  ]) {
    await reject(
      `published revision immutable: ${field}`,
      () =>
        client.query(
          `UPDATE public."ExperienceRevision" SET "${field}"=$1 WHERE id=$2`,
          [value, revisionA],
        ),
      '23514',
      'bizzres_revision_immutable',
    );
  }
  // Unlink first so deletion is rejected by the trigger, not merely by the FK.
  await client.query(
    'UPDATE public."Experience" SET "publishedRevisionId"=NULL,"acceptingReservations"=false WHERE id=$1',
    [experienceA],
  );
  await reject(
    'published revision deletion',
    () =>
      client.query('DELETE FROM public."ExperienceRevision" WHERE id=$1', [
        revisionA,
      ]),
    '23514',
    'bizzres_revision_immutable',
  );

  label = 'valid reservations and events';
  const reservationId = randomUUID();
  await insert('Reservation', reservation({ id: reservationId }));
  await insert(
    'Reservation',
    reservation({
      status: 'CANCELLED',
      cancelledAt: now,
      cancellationReason: 'Fixture',
    }),
  );
  const event = (extra = {}) => ({
    id: randomUUID(),
    organizationId: orgA,
    reservationId,
    type: 'CREATED',
    actorKind: 'GUEST',
    payloadVersion: 1,
    payload: {},
    ...extra,
  });
  for (const extra of [
    { actorKind: 'MEMBER' },
    { actorKind: 'GUEST', actorMemberId: memberA },
    { actorKind: 'SYSTEM', actorMemberId: memberA },
  ]) {
    await reject(
      'event actor consistency',
      () => insert('ReservationEvent', event(extra)),
      '23514',
      'bizzres_event_actor_check',
    );
  }
  await reject(
    'cross-tenant event actor',
    () =>
      insert(
        'ReservationEvent',
        event({ actorKind: 'MEMBER', actorMemberId: memberB }),
      ),
    '23503',
  );
  await reject(
    'cross-tenant event reservation',
    () => insert('ReservationEvent', event({ organizationId: orgB })),
    '23503',
  );
  for (const payloadVersion of [0, -1])
    await reject(
      `event payload version ${payloadVersion}`,
      () => insert('ReservationEvent', event({ payloadVersion })),
      '23514',
      'bizzres_event_payload_version_check',
    );
  const eventId = randomUUID();
  await insert('ReservationEvent', event({ id: eventId }));
  await insert(
    'ReservationEvent',
    event({ actorKind: 'MEMBER', actorMemberId: memberA }),
  );
  await insert('ReservationEvent', event({ actorKind: 'SYSTEM' }));
  await reject(
    'event update forbidden',
    () =>
      client.query(
        'UPDATE public."ReservationEvent" SET payload=$1 WHERE id=$2',
        [{ changed: true }, eventId],
      ),
    '23514',
    'bizzres_event_append_only',
  );
  await reject(
    'event deletion forbidden',
    () =>
      client.query('DELETE FROM public."ReservationEvent" WHERE id=$1', [
        eventId,
      ]),
    '23514',
    'bizzres_event_append_only',
  );

  label = 'rollback verification';
  await client.query('ROLLBACK');
  transaction = false;
  assert.deepEqual(await counts(), before);
  process.stdout.write(
    `PASS: ${passed} integrity cases; all fixtures rolled back, table counts unchanged.\n`,
  );
} catch {
  process.stderr.write(`FAIL: ${label}; database error details suppressed.\n`);
  process.exitCode = 1;
} finally {
  try {
    if (transaction) await client.query('ROLLBACK');
    await client?.end();
  } catch {
    process.stderr.write(
      'Integrity test cleanup failed; details suppressed.\n',
    );
    process.exitCode = 1;
  }
}
