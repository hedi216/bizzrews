import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import console from 'node:console';
import process from 'node:process';
import { createPrismaClient } from '../dist/index.js';

const db = createPrismaClient(process.env.DATABASE_URL || '');
const ids = {
  user: randomUUID(),
  organization: randomUUID(),
  business: randomUUID(),
};
let checks = 0;
async function rejected(label, operation) {
  await assert.rejects(operation);
  console.log(`PASS: ${label}`);
  checks++;
}
try {
  await db.user.create({
    data: {
      id: ids.user,
      email: `${ids.user}@example.test`,
      normalizedEmail: `${ids.user}@example.test`,
    },
  });
  await db.organization.create({
    data: { id: ids.organization, name: 'Loyalty verification' },
  });
  await db.business.create({
    data: {
      id: ids.business,
      organizationId: ids.organization,
      name: 'Loyalty verification',
      slug: `loyalty-${ids.business}`,
      timezone: 'UTC',
      defaultCurrency: 'EUR',
    },
  });
  const account = await db.customerLoyaltyAccount.create({
    data: {
      organizationId: ids.organization,
      businessId: ids.business,
      userId: ids.user,
    },
  });
  const earned = await db.customerLoyaltyTransaction.create({
    data: {
      organizationId: ids.organization,
      businessId: ids.business,
      accountId: account.id,
      type: 'EARN',
      pointsDelta: 20,
      description: 'Verification earn',
    },
  });
  assert.equal(earned.balanceAfter, 20);
  const spent = await db.customerLoyaltyTransaction.create({
    data: {
      organizationId: ids.organization,
      businessId: ids.business,
      accountId: account.id,
      type: 'SPEND',
      pointsDelta: -7,
      description: 'Verification spend',
    },
  });
  assert.equal(spent.balanceAfter, 13);
  assert.equal(
    (
      await db.customerLoyaltyAccount.findUniqueOrThrow({
        where: { id: account.id },
      })
    ).balance,
    13,
  );
  checks += 3;
  await rejected('earn direction', () =>
    db.customerLoyaltyTransaction.create({
      data: {
        organizationId: ids.organization,
        businessId: ids.business,
        accountId: account.id,
        type: 'EARN',
        pointsDelta: -1,
      },
    }),
  );
  await rejected('overspend rejected', () =>
    db.customerLoyaltyTransaction.create({
      data: {
        organizationId: ids.organization,
        businessId: ids.business,
        accountId: account.id,
        type: 'SPEND',
        pointsDelta: -14,
      },
    }),
  );
  await rejected('direct balance mutation rejected', () =>
    db.customerLoyaltyAccount.update({
      where: { id: account.id },
      data: { balance: 99 },
    }),
  );
  await rejected('ledger update rejected', () =>
    db.customerLoyaltyTransaction.update({
      where: { id: earned.id },
      data: { description: 'changed' },
    }),
  );
  await rejected('ledger delete rejected', () =>
    db.customerLoyaltyTransaction.delete({ where: { id: spent.id } }),
  );
  console.log(`PASS: ${checks} customer-loyalty integrity cases.`);
} finally {
  await db.$executeRawUnsafe(
    'ALTER TABLE public."CustomerLoyaltyTransaction" DISABLE TRIGGER bizzres_customer_loyalty_transaction_append_only',
  );
  await db.customerLoyaltyTransaction.deleteMany({
    where: { account: { userId: ids.user } },
  });
  await db.$executeRawUnsafe(
    'ALTER TABLE public."CustomerLoyaltyTransaction" ENABLE TRIGGER bizzres_customer_loyalty_transaction_append_only',
  );
  await db.customerLoyaltyAccount.deleteMany({ where: { userId: ids.user } });
  await db.business.deleteMany({ where: { id: ids.business } });
  await db.organization.deleteMany({ where: { id: ids.organization } });
  await db.user.deleteMany({ where: { id: ids.user } });
  await db.$disconnect();
}
