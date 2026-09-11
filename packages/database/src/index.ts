import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from './generated/prisma/client';

export { Prisma, PrismaClient };

// The API database provider owns one client and its shutdown lifecycle.
// Importing this package never creates a connection.
export function createPrismaClient(connectionString: string): PrismaClient {
  if (!connectionString.trim()) {
    throw new Error(
      'DATABASE_URL must be configured before creating a database client.',
    );
  }
  let url: URL;
  try {
    url = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error();
    }
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }
  return new PrismaClient({
    adapter: new PrismaPg(
      {
        connectionString,
        max: 5,
        connectionTimeoutMillis: 3_000,
        idleTimeoutMillis: 30_000,
        statement_timeout: 5_000,
        query_timeout: 5_000,
      },
      { schema: url.searchParams.get('schema') || 'public' },
    ),
    log: [],
  });
}
