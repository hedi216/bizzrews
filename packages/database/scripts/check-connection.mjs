import process from 'node:process';
import { createPrismaClient } from '@bizzres/database';

let client;
try {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error();
  }
  client = createPrismaClient(url);
  await client.$queryRaw`SELECT 1`;
  process.stdout.write('Database reachable.\n');
} catch {
  process.stderr.write(
    'Database check failed. Configure DATABASE_URL in the root .env and verify local PostgreSQL access.\n',
  );
  process.exitCode = 1;
} finally {
  try {
    await client?.$disconnect();
  } catch {
    process.stderr.write('Database disconnect failed.\n');
    process.exitCode = 1;
  }
}
