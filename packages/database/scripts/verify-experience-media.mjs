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
async function rejected(label, sql, values, code = '23514') {
  await client.query('SAVEPOINT media_case');
  await assert.rejects(
    () => client.query(sql, values),
    (error) => error.code === code,
  );
  await client.query('ROLLBACK TO SAVEPOINT media_case');
  console.log(`PASS: ${label}`);
  passed++;
}
try {
  await client.connect();
  await client.query('BEGIN');
  transaction = true;
  const org = randomUUID();
  const otherOrg = randomUUID();
  const business = randomUUID();
  const otherBusiness = randomUUID();
  const experience = randomUUID();
  const revision = randomUUID();
  const block = randomUUID();
  await client.query(
    'INSERT INTO "Organization" (id,name,"updatedAt") VALUES ($1,$2,now()),($3,$4,now())',
    [org, 'Media integrity', otherOrg, 'Other media'],
  );
  await client.query(
    'INSERT INTO "Business" (id,"organizationId",name,slug,timezone,"defaultCurrency","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now()),($7,$8,$9,$10,$11,$12,now())',
    [
      business,
      org,
      'Media',
      `media-${business}`,
      'UTC',
      'EUR',
      otherBusiness,
      otherOrg,
      'Other',
      `media-${otherBusiness}`,
      'UTC',
      'EUR',
    ],
  );
  await client.query(
    'INSERT INTO "Experience" (id,"organizationId","businessId",slug,"updatedAt") VALUES ($1,$2,$3,$4,now())',
    [experience, org, business, `media-${experience}`],
  );
  await client.query(
    'INSERT INTO "ExperienceRevision" (id,"organizationId","experienceId",version,name,"priceAmount",currency,"updatedAt") VALUES ($1,$2,$3,1,$4,0,$5,now())',
    [revision, org, experience, 'Media draft', 'EUR'],
  );
  await client.query(
    'INSERT INTO "PageBlock" (id,"organizationId","experienceId","revisionId",type,position,config,"updatedAt") VALUES ($1,$2,$3,$4,$5,0,$6,now())',
    [block, org, experience, revision, 'HERO', '{}'],
  );
  const assetSql =
    'INSERT INTO "MediaAsset" (id,"organizationId","businessId","originalName","mimeType","sizeBytes","storageKey") VALUES ($1,$2,$3,$4,$5,$6,$7)';
  await rejected('blank media name rejected', assetSql, [
    randomUUID(),
    org,
    business,
    ' ',
    'image/png',
    8,
    `${randomUUID()}.png`,
  ]);
  await rejected('unsupported media MIME rejected', assetSql, [
    randomUUID(),
    org,
    business,
    'a.svg',
    'image/svg+xml',
    8,
    `${randomUUID()}.png`,
  ]);
  await rejected('oversize media rejected', assetSql, [
    randomUUID(),
    org,
    business,
    'a.png',
    'image/png',
    8388609,
    `${randomUUID()}.png`,
  ]);
  await rejected('unsafe storage key rejected', assetSql, [
    randomUUID(),
    org,
    business,
    'a.png',
    'image/png',
    8,
    '../a.png',
  ]);
  const media = randomUUID();
  await client.query(assetSql, [
    media,
    org,
    business,
    'a.png',
    'image/png',
    8,
    `${randomUUID()}.png`,
  ]);
  const linkSql =
    'INSERT INTO "PageBlockMedia" (id,"organizationId","businessId","experienceId","revisionId","pageBlockId","mediaAssetId",position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)';
  await rejected('negative media position rejected', linkSql, [
    randomUUID(),
    org,
    business,
    experience,
    revision,
    block,
    media,
    -1,
  ]);
  await rejected(
    'cross-tenant media link rejected',
    linkSql,
    [randomUUID(), org, otherBusiness, experience, revision, block, media, 0],
    '23503',
  );
  const link = randomUUID();
  await client.query(linkSql, [
    link,
    org,
    business,
    experience,
    revision,
    block,
    media,
    0,
  ]);
  await client.query(
    'UPDATE "ExperienceRevision" SET "publishedAt"=now(),"updatedAt"=now() WHERE id=$1',
    [revision],
  );
  await rejected(
    'published media placement immutable',
    'UPDATE "PageBlockMedia" SET position=2 WHERE id=$1',
    [link],
  );
  await rejected(
    'published media placement cannot be deleted',
    'DELETE FROM "PageBlockMedia" WHERE id=$1',
    [link],
  );
  console.log(
    `PASS: ${passed} experience-media integrity cases; fixtures rolled back.`,
  );
} finally {
  if (transaction) await client.query('ROLLBACK');
  await client.end();
}
