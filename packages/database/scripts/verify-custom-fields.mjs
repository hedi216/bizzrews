import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import pg from 'pg';

const expectedTables = [
  'Business',
  'Experience',
  'ExperienceRevision',
  'FieldDefinition',
  'FieldOption',
  'Occurrence',
  'Organization',
  'OrganizationMember',
  'Reservation',
  'ReservationAnswer',
  'ReservationEvent',
  'User',
  'PasswordCredential',
  'AuthSession',
  'Resource',
  'ExperienceResource',
  'ResourceWeeklyAvailability',
  'ResourceAvailabilityOverride',
  'CustomerLoyaltyAccount',
  'CustomerLoyaltyTransaction',
  'BusinessRewardAccount',
  'BusinessRewardTransaction',
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

  const { rows: tables } = await client.query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename",
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
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SET LOCAL statement_timeout='5s'");

  const insert = async (table, data) => {
    assert.ok(expectedTables.includes(table));
    const columns = Object.keys(data);
    assert.ok(columns.every((key) => /^[a-zA-Z]+$/.test(key)));
    return client.query(
      `INSERT INTO public."${table}" (${columns.map((key) => `"${key}"`).join(', ')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(', ')})`,
      Object.values(data),
    );
  };
  const reject = async (name, operation, code, constraint) => {
    label = name;
    await client.query('SAVEPOINT custom_case');
    let failure;
    try {
      await operation();
    } catch (error) {
      failure = error;
    }
    await client.query('ROLLBACK TO SAVEPOINT custom_case');
    await client.query('RELEASE SAVEPOINT custom_case');
    assert.ok(failure, `${name}: invalid write was accepted`);
    assert.equal(failure.code, code, `${name}: wrong SQLSTATE`);
    if (constraint)
      assert.equal(failure.constraint, constraint, `${name}: wrong constraint`);
    passed += 1;
    process.stdout.write(`PASS: ${name}\n`);
  };
  const accept = async (name, operation) => {
    label = name;
    await operation();
    passed += 1;
    process.stdout.write(`PASS: ${name}\n`);
  };

  const now = new Date('2031-01-01T00:00:00.000Z');
  const orgA = randomUUID(),
    orgB = randomUUID();
  const businessA = randomUUID(),
    businessB = randomUUID();
  const experienceA = randomUUID(),
    experienceB = randomUUID(),
    experienceC = randomUUID();
  const revisionA = randomUUID(),
    revisionB = randomUUID(),
    revisionC = randomUUID();
  const occurrenceA = randomUUID(),
    reservationA = randomUUID();

  for (const id of [orgA, orgB])
    await insert('Organization', {
      id,
      name: 'Custom field fixture',
      updatedAt: now,
    });
  await insert('Business', {
    id: businessA,
    organizationId: orgA,
    name: 'A',
    slug: businessA,
    timezone: 'Europe/Paris',
    defaultCurrency: 'EUR',
    updatedAt: now,
  });
  await insert('Business', {
    id: businessB,
    organizationId: orgB,
    name: 'B',
    slug: businessB,
    timezone: 'Europe/Paris',
    defaultCurrency: 'EUR',
    updatedAt: now,
  });
  await insert('Experience', {
    id: experienceA,
    organizationId: orgA,
    businessId: businessA,
    slug: experienceA,
    updatedAt: now,
  });
  await insert('Experience', {
    id: experienceB,
    organizationId: orgA,
    businessId: businessA,
    slug: experienceB,
    updatedAt: now,
  });
  await insert('Experience', {
    id: experienceC,
    organizationId: orgB,
    businessId: businessB,
    slug: experienceC,
    updatedAt: now,
  });
  for (const [id, organizationId, experienceId] of [
    [revisionA, orgA, experienceA],
    [revisionB, orgA, experienceB],
    [revisionC, orgB, experienceC],
  ]) {
    await insert('ExperienceRevision', {
      id,
      organizationId,
      experienceId,
      version: 1,
      name: 'Draft',
      priceAmount: '0',
      currency: 'EUR',
      updatedAt: now,
    });
  }
  await insert('Occurrence', {
    id: occurrenceA,
    organizationId: orgA,
    experienceId: experienceA,
    businessId: businessA,
    startAt: now,
    endAt: new Date('2031-01-01T01:00:00Z'),
    timezone: 'Europe/Paris',
    capacity: 10,
    updatedAt: now,
  });
  await insert('Reservation', {
    id: reservationA,
    organizationId: orgA,
    experienceId: experienceA,
    revisionId: revisionA,
    occurrenceId: occurrenceA,
    customerFullName: 'Fixture',
    customerPhone: '+33000000000',
    customerEmail: 'fixture@example.invalid',
    startAt: now,
    endAt: new Date('2031-01-01T01:00:00Z'),
    timezone: 'Europe/Paris',
    participantCount: 1,
    totalAmount: '0',
    currency: 'EUR',
    experienceSnapshot: { name: 'Draft' },
    updatedAt: now,
  });

  const field = (extra = {}) => ({
    id: randomUUID(),
    organizationId: orgA,
    experienceId: experienceA,
    revisionId: revisionA,
    key: `field_${randomUUID().replaceAll('-', '')}`,
    label: 'Question',
    type: 'TEXT',
    position: 0,
    updatedAt: now,
    ...extra,
  });
  await accept('valid field key', () =>
    insert('FieldDefinition', field({ key: 'preferred_style' })),
  );
  for (const [name, key] of [
    ['uppercase field key', 'Preferred_style'],
    ['special-character field key', 'preferred-style'],
    ['reserved exact field key', 'customer_email'],
    ['reserved-prefix field key', 'booking_notes'],
  ]) {
    await reject(
      name,
      () => insert('FieldDefinition', field({ key })),
      '23514',
      'bizzres_field_key_check',
    );
  }
  await reject(
    'blank field label',
    () => insert('FieldDefinition', field({ label: '   ' })),
    '23514',
    'bizzres_field_label_check',
  );
  await reject(
    'negative field position',
    () => insert('FieldDefinition', field({ position: -1 })),
    '23514',
    'bizzres_field_position_check',
  );
  await reject(
    'non-object field validation',
    () =>
      insert(
        'FieldDefinition',
        field({ validation: JSON.stringify(['invalid']) }),
      ),
    '23514',
    'bizzres_field_validation_object_check',
  );
  await reject(
    'cross-tenant field revision',
    () => insert('FieldDefinition', field({ organizationId: orgB })),
    '23503',
  );
  await reject(
    'cross-experience field revision',
    () => insert('FieldDefinition', field({ experienceId: experienceB })),
    '23503',
  );

  const ids = Object.fromEntries(
    [
      'text',
      'number',
      'checkbox',
      'select',
      'radio',
      'multi',
      'date',
      'time',
      'mutable',
    ].map((key) => [key, randomUUID()]),
  );
  for (const [key, type] of [
    ['text', 'TEXT'],
    ['number', 'NUMBER'],
    ['checkbox', 'CHECKBOX'],
    ['select', 'SELECT'],
    ['radio', 'RADIO'],
    ['multi', 'MULTISELECT'],
    ['date', 'DATE'],
    ['time', 'TIME'],
    ['mutable', 'TEXT'],
  ]) {
    await insert(
      'FieldDefinition',
      field({
        id: ids[key],
        key: `${key}_question`,
        label: `${key} question`,
        type,
        position: 1,
      }),
    );
  }
  await accept('draft field update', () =>
    client.query(
      'UPDATE public."FieldDefinition" SET label=$1,"updatedAt"=$2 WHERE id=$3',
      ['Mutable question', now, ids.mutable],
    ),
  );
  const option = (extra = {}) => ({
    id: randomUUID(),
    organizationId: orgA,
    experienceId: experienceA,
    revisionId: revisionA,
    fieldDefinitionId: ids.select,
    key: `option_${randomUUID().replaceAll('-', '')}`,
    label: 'Option',
    position: 0,
    updatedAt: now,
    ...extra,
  });
  const selectA = randomUUID(),
    selectB = randomUUID(),
    radioA = randomUUID(),
    multiA = randomUUID(),
    multiB = randomUUID();
  await accept('valid SELECT option', () =>
    insert(
      'FieldOption',
      option({ id: selectA, key: 'bus', label: 'Shared bus' }),
    ),
  );
  await insert(
    'FieldOption',
    option({ id: selectB, key: 'car', label: 'Car' }),
  );
  await insert(
    'FieldOption',
    option({
      id: radioA,
      fieldDefinitionId: ids.radio,
      key: 'beginner',
      label: 'Beginner',
    }),
  );
  await insert(
    'FieldOption',
    option({
      id: multiA,
      fieldDefinitionId: ids.multi,
      key: 'tent',
      label: 'Tent',
    }),
  );
  await insert(
    'FieldOption',
    option({
      id: multiB,
      fieldDefinitionId: ids.multi,
      key: 'food',
      label: 'Food',
    }),
  );
  await reject(
    'option on TEXT',
    () => insert('FieldOption', option({ fieldDefinitionId: ids.text })),
    '23514',
    'bizzres_option_field_type',
  );
  await reject(
    'option on CHECKBOX',
    () => insert('FieldOption', option({ fieldDefinitionId: ids.checkbox })),
    '23514',
    'bizzres_option_field_type',
  );
  await reject(
    'blank option label',
    () => insert('FieldOption', option({ label: '   ' })),
    '23514',
    'bizzres_option_label_check',
  );
  await reject(
    'invalid option key',
    () => insert('FieldOption', option({ key: 'Bad-Key' })),
    '23514',
    'bizzres_option_key_check',
  );
  await reject(
    'duplicate option key',
    () => insert('FieldOption', option({ key: 'bus' })),
    '23505',
  );
  await reject(
    'cross-revision option',
    () => insert('FieldOption', option({ revisionId: revisionB })),
    '23503',
  );

  await client.query(
    'UPDATE public."ExperienceRevision" SET "publishedAt"=$1,"updatedAt"=$1 WHERE id=$2',
    [now, revisionA],
  );
  await reject(
    'published field insert',
    () => insert('FieldDefinition', field()),
    '23514',
    'bizzres_published_revision_children_immutable',
  );
  await reject(
    'published field update',
    () =>
      client.query('UPDATE public."FieldDefinition" SET label=$1 WHERE id=$2', [
        'Changed',
        ids.text,
      ]),
    '23514',
    'bizzres_published_revision_children_immutable',
  );
  await reject(
    'published field delete',
    () =>
      client.query('DELETE FROM public."FieldDefinition" WHERE id=$1', [
        ids.text,
      ]),
    '23514',
    'bizzres_published_revision_children_immutable',
  );
  await reject(
    'published option insert',
    () => insert('FieldOption', option({ key: 'train' })),
    '23514',
    'bizzres_published_revision_children_immutable',
  );
  await reject(
    'published option update',
    () =>
      client.query('UPDATE public."FieldOption" SET label=$1 WHERE id=$2', [
        'Changed',
        selectA,
      ]),
    '23514',
    'bizzres_published_revision_children_immutable',
  );
  await reject(
    'published option delete',
    () =>
      client.query('DELETE FROM public."FieldOption" WHERE id=$1', [selectA]),
    '23514',
    'bizzres_published_revision_children_immutable',
  );

  const plainSnapshot = (key, label, type) => ({ key, label, type });
  const selectableSnapshot = (key, label, type, selectedOptions) => ({
    key,
    label,
    type,
    selectedOptions,
  });
  const answer = (
    fieldDefinitionId,
    value,
    definitionSnapshot,
    extra = {},
  ) => ({
    id: randomUUID(),
    organizationId: orgA,
    experienceId: experienceA,
    revisionId: revisionA,
    reservationId: reservationA,
    fieldDefinitionId,
    value: JSON.stringify(value),
    definitionSnapshot,
    ...extra,
  });
  await reject(
    'JSON null answer',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.text,
          null,
          plainSnapshot('text_question', 'text question', 'TEXT'),
        ),
      ),
    '23514',
    'bizzres_answer_value_type',
  );
  await reject(
    'incorrect definition snapshot',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.text,
          'hello',
          plainSnapshot('wrong_key', 'text question', 'TEXT'),
        ),
      ),
    '23514',
    'bizzres_answer_definition_snapshot',
  );
  await accept('valid TEXT answer', () =>
    insert(
      'ReservationAnswer',
      answer(
        ids.text,
        'hello',
        plainSnapshot('text_question', 'text question', 'TEXT'),
      ),
    ),
  );
  await reject(
    'NUMBER as JSON number',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.number,
          12.5,
          plainSnapshot('number_question', 'number question', 'NUMBER'),
        ),
      ),
    '23514',
    'bizzres_answer_value_type',
  );
  await reject(
    'malformed NUMBER',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.number,
          '01.2',
          plainSnapshot('number_question', 'number question', 'NUMBER'),
        ),
      ),
    '23514',
    'bizzres_answer_value_type',
  );
  await accept('valid NUMBER answer', () =>
    insert(
      'ReservationAnswer',
      answer(
        ids.number,
        '12.50',
        plainSnapshot('number_question', 'number question', 'NUMBER'),
      ),
    ),
  );
  await reject(
    'string CHECKBOX',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.checkbox,
          'true',
          plainSnapshot('checkbox_question', 'checkbox question', 'CHECKBOX'),
        ),
      ),
    '23514',
    'bizzres_answer_value_type',
  );
  await accept('valid CHECKBOX answer', () =>
    insert(
      'ReservationAnswer',
      answer(
        ids.checkbox,
        true,
        plainSnapshot('checkbox_question', 'checkbox question', 'CHECKBOX'),
      ),
    ),
  );
  await reject(
    'unknown SELECT option',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.select,
          'plane',
          selectableSnapshot('select_question', 'select question', 'SELECT', [
            { key: 'plane', label: 'Plane' },
          ]),
        ),
      ),
    '23514',
    'bizzres_answer_option_membership',
  );
  await reject(
    'incorrect selected-option snapshot',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.select,
          'bus',
          selectableSnapshot('select_question', 'select question', 'SELECT', [
            { key: 'bus', label: 'Wrong' },
          ]),
        ),
      ),
    '23514',
    'bizzres_answer_option_snapshot',
  );
  await accept('valid SELECT answer', () =>
    insert(
      'ReservationAnswer',
      answer(
        ids.select,
        'bus',
        selectableSnapshot('select_question', 'select question', 'SELECT', [
          { key: 'bus', label: 'Shared bus' },
        ]),
      ),
    ),
  );
  await accept('valid RADIO answer', () =>
    insert(
      'ReservationAnswer',
      answer(
        ids.radio,
        'beginner',
        selectableSnapshot('radio_question', 'radio question', 'RADIO', [
          { key: 'beginner', label: 'Beginner' },
        ]),
      ),
    ),
  );
  await reject(
    'duplicate MULTISELECT option',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.multi,
          ['tent', 'tent'],
          selectableSnapshot(
            'multi_question',
            'multi question',
            'MULTISELECT',
            [
              { key: 'tent', label: 'Tent' },
              { key: 'tent', label: 'Tent' },
            ],
          ),
        ),
      ),
    '23514',
    'bizzres_answer_option_membership',
  );
  await reject(
    'unknown MULTISELECT option',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.multi,
          ['tent', 'unknown'],
          selectableSnapshot(
            'multi_question',
            'multi question',
            'MULTISELECT',
            [
              { key: 'tent', label: 'Tent' },
              { key: 'unknown', label: 'Unknown' },
            ],
          ),
        ),
      ),
    '23514',
    'bizzres_answer_option_membership',
  );
  await accept('valid MULTISELECT answer', () =>
    insert(
      'ReservationAnswer',
      answer(
        ids.multi,
        ['tent', 'food'],
        selectableSnapshot('multi_question', 'multi question', 'MULTISELECT', [
          { key: 'tent', label: 'Tent' },
          { key: 'food', label: 'Food' },
        ]),
      ),
    ),
  );
  await reject(
    'impossible DATE',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.date,
          '2031-02-31',
          plainSnapshot('date_question', 'date question', 'DATE'),
        ),
      ),
    '23514',
    'bizzres_answer_value_type',
  );
  await accept('valid DATE answer', () =>
    insert(
      'ReservationAnswer',
      answer(
        ids.date,
        '2031-02-28',
        plainSnapshot('date_question', 'date question', 'DATE'),
      ),
    ),
  );
  await reject(
    'invalid TIME',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.time,
          '24:00',
          plainSnapshot('time_question', 'time question', 'TIME'),
        ),
      ),
    '23514',
    'bizzres_answer_value_type',
  );
  await accept('valid TIME answer', () =>
    insert(
      'ReservationAnswer',
      answer(
        ids.time,
        '23:59',
        plainSnapshot('time_question', 'time question', 'TIME'),
      ),
    ),
  );
  await reject(
    'cross-revision answer',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.mutable,
          'x',
          plainSnapshot('mutable_question', 'Mutable question', 'TEXT'),
          { revisionId: revisionB },
        ),
      ),
    '23503',
  );
  await reject(
    'duplicate reservation field answer',
    () =>
      insert(
        'ReservationAnswer',
        answer(
          ids.text,
          'again',
          plainSnapshot('text_question', 'text question', 'TEXT'),
        ),
      ),
    '23505',
  );
  const {
    rows: [stored],
  } = await client.query(
    'SELECT id FROM public."ReservationAnswer" WHERE "fieldDefinitionId"=$1',
    [ids.text],
  );
  await reject(
    'answer update forbidden',
    () =>
      client.query(
        'UPDATE public."ReservationAnswer" SET value=$1 WHERE id=$2',
        [JSON.stringify('changed'), stored.id],
      ),
    '23514',
    'bizzres_answer_immutable',
  );
  await reject(
    'answer delete forbidden',
    () =>
      client.query('DELETE FROM public."ReservationAnswer" WHERE id=$1', [
        stored.id,
      ]),
    '23514',
    'bizzres_answer_immutable',
  );

  label = 'rollback verification';
  await client.query('ROLLBACK');
  transaction = false;
  assert.deepEqual(await counts(), before);
  process.stdout.write(
    `PASS: ${passed} custom-field integrity cases; all fixtures rolled back, table counts unchanged.\n`,
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
      'Custom-field integrity cleanup failed; details suppressed.\n',
    );
    process.exitCode = 1;
  }
}
