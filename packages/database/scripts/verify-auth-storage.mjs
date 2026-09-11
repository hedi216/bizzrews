import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';
import pg from 'pg';

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
  client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 3000,
  });
  await client.connect();
  const before = await client.query(
    'SELECT (SELECT count(*)::int FROM public."User") users, (SELECT count(*)::int FROM public."PasswordCredential") credentials, (SELECT count(*)::int FROM public."AuthSession") sessions',
  );
  await client.query('BEGIN');
  transaction = true;

  const reject = async (name, sql, values, constraint) => {
    label = name;
    await client.query('SAVEPOINT auth_storage_case');
    let failure;
    try {
      await client.query(sql, values);
    } catch (error) {
      failure = error;
    }
    await client.query('ROLLBACK TO SAVEPOINT auth_storage_case');
    await client.query('RELEASE SAVEPOINT auth_storage_case');
    assert.ok(failure, `${name}: invalid write accepted`);
    assert.equal(failure.code, '23514');
    assert.equal(failure.constraint, constraint);
    passed += 1;
    process.stdout.write(`PASS: ${name}\n`);
  };

  const userId = randomUUID();
  const createdAt = new Date('2032-01-01T00:00:00Z');
  await client.query(
    'INSERT INTO public."User" (id,email,"normalizedEmail","createdAt","updatedAt") VALUES ($1,$2,$2,$3,$3)',
    [userId, `${userId}@example.invalid`, createdAt],
  );
  await reject(
    'blank password hash',
    'INSERT INTO public."PasswordCredential" (id,"userId","passwordHash","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$4)',
    [randomUUID(), userId, '   ', createdAt],
    'bizzres_password_hash_nonblank_check',
  );
  await client.query(
    'INSERT INTO public."PasswordCredential" (id,"userId","passwordHash","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$4)',
    [randomUUID(), userId, '$argon2id$test-only-non-plaintext', createdAt],
  );
  const sessionSql =
    'INSERT INTO public."AuthSession" (id,"userId","refreshTokenHash","expiresAt","revokedAt","lastUsedAt","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$7)';
  await reject(
    'malformed refresh hash',
    sessionSql,
    [
      randomUUID(),
      userId,
      'raw-refresh-token',
      new Date('2032-02-01Z'),
      null,
      null,
      createdAt,
    ],
    'bizzres_refresh_token_hash_check',
  );
  await reject(
    'nonpositive session lifetime',
    sessionSql,
    [randomUUID(), userId, 'a'.repeat(64), createdAt, null, null, createdAt],
    'bizzres_auth_session_expiry_check',
  );
  await reject(
    'revocation before creation',
    sessionSql,
    [
      randomUUID(),
      userId,
      'b'.repeat(64),
      new Date('2032-02-01Z'),
      new Date('2031-12-31Z'),
      null,
      createdAt,
    ],
    'bizzres_auth_session_revoked_at_check',
  );
  await reject(
    'last use before creation',
    sessionSql,
    [
      randomUUID(),
      userId,
      'c'.repeat(64),
      new Date('2032-02-01Z'),
      null,
      new Date('2031-12-31Z'),
      createdAt,
    ],
    'bizzres_auth_session_last_used_at_check',
  );
  await client.query(sessionSql, [
    randomUUID(),
    userId,
    'd'.repeat(64),
    new Date('2032-02-01Z'),
    null,
    createdAt,
    createdAt,
  ]);
  passed += 1;
  process.stdout.write('PASS: valid hashed credential and session storage\n');

  label = 'rollback verification';
  await client.query('ROLLBACK');
  transaction = false;
  const after = await client.query(
    'SELECT (SELECT count(*)::int FROM public."User") users, (SELECT count(*)::int FROM public."PasswordCredential") credentials, (SELECT count(*)::int FROM public."AuthSession") sessions',
  );
  assert.deepEqual(after.rows[0], before.rows[0]);
  process.stdout.write(
    `PASS: ${passed} auth-storage cases; all fixtures rolled back.\n`,
  );
} catch {
  process.stderr.write(`FAIL: ${label}; database error details suppressed.\n`);
  process.exitCode = 1;
} finally {
  try {
    if (transaction) await client.query('ROLLBACK');
    await client?.end();
  } catch {
    process.stderr.write('Auth-storage cleanup failed; details suppressed.\n');
    process.exitCode = 1;
  }
}
