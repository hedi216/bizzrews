import assert from 'node:assert/strict';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { createPrismaClient } from '../dist/index.js';

const db = createPrismaClient(process.env.DATABASE_URL || '');
const organizationId = randomUUID();
const businessId = randomUUID();
let checks = 0;
async function rejected(label, operation) {
  await assert.rejects(operation);
  console.log(`PASS: ${label}`);
  checks++;
}
try {
  await db.organization.create({
    data: { id: organizationId, name: 'Business rewards verification' },
  });
  await db.business.create({
    data: {
      id: businessId,
      organizationId,
      name: 'Business rewards verification',
      slug: `reward-${businessId}`,
      timezone: 'UTC',
      defaultCurrency: 'EUR',
    },
  });
  const account = await db.businessRewardAccount.create({
    data: { organizationId, businessId },
  });
  const earned = await db.businessRewardTransaction.create({
    data: {
      organizationId,
      businessId,
      accountId: account.id,
      type: 'EARN',
      pointsDelta: 30,
      description: 'Verification earn',
    },
  });
  assert.equal(earned.balanceAfter, 30);
  const spent = await db.businessRewardTransaction.create({
    data: {
      organizationId,
      businessId,
      accountId: account.id,
      type: 'SPEND',
      pointsDelta: -9,
      description: 'Verification spend',
    },
  });
  assert.equal(spent.balanceAfter, 21);
  assert.equal(
    (
      await db.businessRewardAccount.findUniqueOrThrow({
        where: { id: account.id },
      })
    ).balance,
    21,
  );
  checks += 3;
  await rejected('business reward direction', () =>
    db.businessRewardTransaction.create({
      data: {
        organizationId,
        businessId,
        accountId: account.id,
        type: 'SPEND',
        pointsDelta: 1,
      },
    }),
  );
  await rejected('business reward overspend', () =>
    db.businessRewardTransaction.create({
      data: {
        organizationId,
        businessId,
        accountId: account.id,
        type: 'SPEND',
        pointsDelta: -22,
      },
    }),
  );
  await rejected('direct business reward balance mutation', () =>
    db.businessRewardAccount.update({
      where: { id: account.id },
      data: { balance: 99 },
    }),
  );
  await rejected('business reward ledger update', () =>
    db.businessRewardTransaction.update({
      where: { id: earned.id },
      data: { description: 'changed' },
    }),
  );
  await rejected('business reward ledger delete', () =>
    db.businessRewardTransaction.delete({ where: { id: spent.id } }),
  );
  console.log(`PASS: ${checks} business-reward integrity cases.`);
} finally {
  await db.$executeRawUnsafe(
    'ALTER TABLE public."BusinessRewardTransaction" DISABLE TRIGGER bizzres_business_reward_transaction_append_only',
  );
  await db.businessRewardTransaction.deleteMany({ where: { businessId } });
  await db.$executeRawUnsafe(
    'ALTER TABLE public."BusinessRewardTransaction" ENABLE TRIGGER bizzres_business_reward_transaction_append_only',
  );
  await db.businessRewardAccount.deleteMany({ where: { businessId } });
  await db.business.deleteMany({ where: { id: businessId } });
  await db.organization.deleteMany({ where: { id: organizationId } });
  await db.$disconnect();
}
