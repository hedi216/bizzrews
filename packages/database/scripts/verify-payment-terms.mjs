import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL || '');
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
assert.equal(url.pathname, '/bizzres_dev');
const client = new pg.Client({ connectionString: url.toString() });
let transaction = false;
let passed = 0;
async function rejected(label, sql, values) {
  await client.query('SAVEPOINT payment_case');
  await assert.rejects(
    () => client.query(sql, values),
    (error) => {
      assert.equal(error.code, '23514');
      return true;
    },
  );
  await client.query('ROLLBACK TO SAVEPOINT payment_case');
  console.log(`PASS: ${label}`);
  passed++;
}
try {
  await client.connect();
  await client.query('BEGIN');
  transaction = true;
  const organizationId = randomUUID();
  const businessId = randomUUID();
  const experienceId = randomUUID();
  await client.query(
    'INSERT INTO "Organization" (id,name,"updatedAt") VALUES ($1,$2,now())',
    [organizationId, 'Payment verification'],
  );
  await client.query(
    'INSERT INTO "Business" (id,"organizationId",name,slug,timezone,"defaultCurrency","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now())',
    [
      businessId,
      organizationId,
      'Payment verification',
      `payment-${businessId}`,
      'UTC',
      'EUR',
    ],
  );
  await client.query(
    'INSERT INTO "Experience" (id,"organizationId","businessId",slug,"updatedAt") VALUES ($1,$2,$3,$4,now())',
    [experienceId, organizationId, businessId, `payment-${experienceId}`],
  );
  const base =
    'INSERT INTO "ExperienceRevision" (id,"organizationId","experienceId",version,name,"priceAmount",currency,"paymentMode","depositAmount","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())';
  await rejected('required payment rejects zero price', base, [
    randomUUID(),
    organizationId,
    experienceId,
    1,
    'Invalid required',
    '0',
    'EUR',
    'REQUIRED',
    null,
  ]);
  await rejected('deposit requires an amount', base, [
    randomUUID(),
    organizationId,
    experienceId,
    1,
    'Missing deposit',
    '10',
    'EUR',
    'DEPOSIT',
    null,
  ]);
  await rejected('deposit cannot exceed price', base, [
    randomUUID(),
    organizationId,
    experienceId,
    1,
    'Large deposit',
    '10',
    'EUR',
    'DEPOSIT',
    '11',
  ]);
  await rejected('non-deposit mode rejects deposit amount', base, [
    randomUUID(),
    organizationId,
    experienceId,
    1,
    'Unexpected deposit',
    '10',
    'EUR',
    'OPTIONAL',
    '2',
  ]);
  const revisionId = randomUUID();
  await client.query(base, [
    revisionId,
    organizationId,
    experienceId,
    1,
    'Valid deposit',
    '10',
    'EUR',
    'DEPOSIT',
    '2',
  ]);
  await client.query(
    'UPDATE "ExperienceRevision" SET "publishedAt"=now(), "updatedAt"=now() WHERE id=$1',
    [revisionId],
  );
  await rejected(
    'published payment terms are immutable',
    'UPDATE "ExperienceRevision" SET "depositAmount"=$2, "updatedAt"=now() WHERE id=$1',
    [revisionId, '3'],
  );
  console.log(
    `PASS: ${passed + 1} payment-term integrity cases; fixtures rolled back.`,
  );
} finally {
  if (transaction) await client.query('ROLLBACK');
  await client.end();
}
