import assert from 'node:assert/strict';
import process from 'node:process';
import { test } from 'node:test';
import database from '@bizzres/database';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../dist/database/database.service.js';
import { DatabaseHealthController } from '../dist/health/database-health.controller.js';

Logger.overrideLogger(false);

function configureEnvironment(t, value) {
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = value;
  t.after(() => {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  });
}

test('missing configuration creates no client and returns a sanitized 503', async (t) => {
  configureEnvironment(t, '');
  const factory = t.mock.method(database, 'createPrismaClient');
  const service = new DatabaseService();
  await service.onModuleInit();
  assert.equal(factory.mock.callCount(), 0);
  assert.equal(await service.isReachable(), false);
  await assert.rejects(
    new DatabaseHealthController(service).check(),
    (error) => {
      assert.ok(error instanceof ServiceUnavailableException);
      assert.equal(error.getStatus(), 503);
      assert.deepEqual(error.getResponse(), {
        status: 'error',
        database: 'unavailable',
      });
      return true;
    },
  );
  await service.onModuleDestroy();
});

test('concurrent checks share one client and disconnect once on shutdown', async (t) => {
  // A sentinel consumed only by the mocked factory; no credentials or network.
  configureEnvironment(t, 'unit-test-configuration');
  const client = {
    $connect: t.mock.fn(async () => {}),
    $queryRaw: t.mock.fn(async () => [{ result: 1 }]),
    $disconnect: t.mock.fn(async () => {}),
  };
  const factory = t.mock.method(database, 'createPrismaClient', () => client);
  const service = new DatabaseService();
  await service.onModuleInit();
  const controller = new DatabaseHealthController(service);
  const responses = await Promise.all(
    Array.from({ length: 12 }, () => controller.check()),
  );
  assert.ok(
    responses.every(
      (response) =>
        response.status === 'ok' && response.database === 'reachable',
    ),
  );
  assert.equal(service.client, client);
  assert.equal(factory.mock.callCount(), 1);
  assert.equal(client.$connect.mock.callCount(), 1);
  assert.equal(client.$queryRaw.mock.callCount(), 12);
  assert.equal(client.$queryRaw.mock.calls[0].arguments[0][0], 'SELECT 1');
  await service.onModuleDestroy();
  assert.equal(client.$disconnect.mock.callCount(), 1);
});

test('startup outage is recoverable using the existing client', async (t) => {
  configureEnvironment(t, 'unit-test-configuration');
  let available = false;
  const client = {
    $connect: async () => {
      throw new Error('internal connection details');
    },
    $queryRaw: async () => {
      if (!available) throw new Error('internal query details');
      return [{ result: 1 }];
    },
    $disconnect: t.mock.fn(async () => {}),
  };
  const factory = t.mock.method(database, 'createPrismaClient', () => client);
  const service = new DatabaseService();
  await service.onModuleInit();
  assert.equal(await service.isReachable(), false);
  available = true;
  assert.deepEqual(await new DatabaseHealthController(service).check(), {
    status: 'ok',
    database: 'reachable',
  });
  assert.equal(factory.mock.callCount(), 1);
  await service.onModuleDestroy();
  assert.equal(client.$disconnect.mock.callCount(), 1);
});

test('invalid URL construction does not break API lifecycle', async (t) => {
  configureEnvironment(t, 'not-a-connection-url');
  const service = new DatabaseService();
  await service.onModuleInit();
  assert.equal(await service.isReachable(), false);
  await service.onModuleDestroy();
});
