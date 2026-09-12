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
async function rejected(label, operation, code = '23514') {
  await client.query('SAVEPOINT commerce_case');
  await assert.rejects(operation, (error) => {
    assert.equal(error.code, code);
    return true;
  });
  await client.query('ROLLBACK TO SAVEPOINT commerce_case');
  console.log(`PASS: ${label}`);
  passed++;
}
try {
  await client.connect();
  await client.query('BEGIN');
  transaction = true;
  const organizationId = randomUUID(),
    otherOrganizationId = randomUUID();
  const businessId = randomUUID(),
    otherBusinessId = randomUUID();
  await client.query(
    'INSERT INTO "Organization" (id,name,"updatedAt") VALUES ($1,$2,now()),($3,$4,now())',
    [organizationId, 'Commerce A', otherOrganizationId, 'Commerce B'],
  );
  await client.query(
    'INSERT INTO "Business" (id,"organizationId",name,slug,timezone,"defaultCurrency","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,now()),($7,$8,$9,$10,$11,$12,now())',
    [
      businessId,
      organizationId,
      'Commerce A',
      `commerce-${businessId}`,
      'UTC',
      'EUR',
      otherBusinessId,
      otherOrganizationId,
      'Commerce B',
      `commerce-${otherBusinessId}`,
      'UTC',
      'EUR',
    ],
  );
  const productId = randomUUID(),
    otherProductId = randomUUID();
  await client.query(
    'INSERT INTO "Product" (id,"organizationId","businessId",name,slug,"updatedAt") VALUES ($1,$2,$3,$4,$5,now()),($6,$7,$8,$9,$10,now())',
    [
      productId,
      organizationId,
      businessId,
      'Mug',
      'mug',
      otherProductId,
      otherOrganizationId,
      otherBusinessId,
      'Other mug',
      'other-mug',
    ],
  );
  await rejected('blank product name', () =>
    client.query(
      'INSERT INTO "Product" (id,"organizationId","businessId",name,slug,"updatedAt") VALUES ($1,$2,$3,$4,$5,now())',
      [randomUUID(), organizationId, businessId, ' ', `bad-${randomUUID()}`],
    ),
  );
  const variantId = randomUUID(),
    otherVariantId = randomUUID();
  const variantSql =
    'INSERT INTO "ProductVariant" (id,"organizationId","businessId","productId",key,name,"priceAmount",currency,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())';
  await client.query(variantSql, [
    variantId,
    organizationId,
    businessId,
    productId,
    'blue_large',
    'Blue / Large',
    '12.50',
    'EUR',
  ]);
  await client.query(variantSql, [
    otherVariantId,
    otherOrganizationId,
    otherBusinessId,
    otherProductId,
    'default',
    'Default',
    '9',
    'EUR',
  ]);
  await rejected('negative variant price', () =>
    client.query(variantSql, [
      randomUUID(),
      organizationId,
      businessId,
      productId,
      'negative',
      'Negative',
      '-1',
      'EUR',
    ]),
  );
  await rejected('invalid variant currency', () =>
    client.query(variantSql, [
      randomUUID(),
      organizationId,
      businessId,
      productId,
      'currency',
      'Currency',
      '1',
      'eur',
    ]),
  );
  const orderId = randomUUID();
  const orderSql =
    'INSERT INTO "Order" (id,"organizationId","businessId","customerFullName","customerPhone","customerEmail","totalAmount",currency,"updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())';
  await client.query(orderSql, [
    orderId,
    organizationId,
    businessId,
    'Guest',
    '+331234',
    'guest@example.com',
    '25',
    'EUR',
  ]);
  await rejected('blank order identity', () =>
    client.query(orderSql, [
      randomUUID(),
      organizationId,
      businessId,
      ' ',
      '+331234',
      'guest@example.com',
      '1',
      'EUR',
    ]),
  );
  const lineSql =
    'INSERT INTO "OrderLine" (id,"organizationId","businessId","orderId","productId","variantId",quantity,"unitAmount","lineTotalAmount","productSnapshot") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)';
  await rejected('nonpositive line quantity', () =>
    client.query(lineSql, [
      randomUUID(),
      organizationId,
      businessId,
      orderId,
      productId,
      variantId,
      0,
      '12.5',
      '0',
      '{}',
    ]),
  );
  await rejected('incorrect line total', () =>
    client.query(lineSql, [
      randomUUID(),
      organizationId,
      businessId,
      orderId,
      productId,
      variantId,
      2,
      '12.5',
      '20',
      '{}',
    ]),
  );
  await rejected(
    'cross-tenant variant',
    () =>
      client.query(lineSql, [
        randomUUID(),
        organizationId,
        businessId,
        orderId,
        productId,
        otherVariantId,
        2,
        '12.5',
        '25',
        '{}',
      ]),
    '23503',
  );
  const lineId = randomUUID();
  await client.query(lineSql, [
    lineId,
    organizationId,
    businessId,
    orderId,
    productId,
    variantId,
    2,
    '12.5',
    '25',
    '{"name":"Mug","variant":"blue_large"}',
  ]);
  await rejected('order line mutation', () =>
    client.query('UPDATE "OrderLine" SET quantity=3 WHERE id=$1', [lineId]),
  );
  const fulfillmentSql =
    'INSERT INTO "OrderFulfillment" (id,"organizationId","businessId","orderId",method,status,"deliveryAddress","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,now())';
  await rejected('delivery requires address', () =>
    client.query(fulfillmentSql, [
      randomUUID(),
      organizationId,
      businessId,
      orderId,
      'DELIVERY',
      'PENDING',
      null,
    ]),
  );
  await rejected('pickup rejects delivery address', () =>
    client.query(fulfillmentSql, [
      randomUUID(),
      organizationId,
      businessId,
      orderId,
      'PICKUP',
      'PENDING',
      '{}',
    ]),
  );
  await client.query(fulfillmentSql, [
    randomUUID(),
    organizationId,
    businessId,
    orderId,
    'PICKUP',
    'PENDING',
    null,
  ]);
  console.log(
    `PASS: ${passed + 3} commerce integrity cases; fixtures rolled back.`,
  );
} finally {
  if (transaction) await client.query('ROLLBACK');
  await client.end();
}
