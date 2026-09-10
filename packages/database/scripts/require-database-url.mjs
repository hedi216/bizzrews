if (!process.env.DATABASE_URL?.trim()) {
  throw new Error(
    'DATABASE_URL is not configured. Set it in the root .env or environment after local PostgreSQL setup.',
  );
}
import process from 'node:process';
