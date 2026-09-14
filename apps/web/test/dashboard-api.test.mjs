/* global Response */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dashboardApi,
  DashboardApiError,
  verifyDashboardMedia,
} from '../lib/api/dashboard.ts';
function mock(body = {}, status = 200) {
  let call;
  globalThis.fetch = async (url, init = {}) => {
    call = { url: String(url), init };
    return new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return () => call;
}
test('authenticated organization request carries bearer token and cookies', async () => {
  const called = mock({ organizations: [] });
  await dashboardApi.organizations('access');
  const c = called();
  assert.match(c.url, /\/organizations$/);
  assert.equal(c.init.credentials, 'include');
  assert.equal(c.init.headers.Authorization, 'Bearer access');
});
test('business mutation uses PATCH with explicit public fields', async () => {
  const called = mock({ id: 'b' });
  await dashboardApi.updateBusiness('t', 'b', { name: 'Studio' });
  const c = called();
  assert.equal(c.init.method, 'PATCH');
  assert.deepEqual(JSON.parse(c.init.body), { name: 'Studio' });
});
test('generated dashboard operations target scoped resources', async () => {
  const called = mock({ resources: [] });
  await dashboardApi.assignments('t', 'experience');
  assert.match(called().url, /\/experiences\/experience\/resources$/);
});
test('API failures become sanitized typed errors', async () => {
  mock({ message: 'Not allowed' }, 403);
  await assert.rejects(
    () => dashboardApi.organizations('t'),
    (e) =>
      e instanceof DashboardApiError &&
      e.status === 403 &&
      e.message === 'Not allowed',
  );
});

test('registration uses the existing auth session contract', async () => {
  const called = mock({ accessToken: 'token', user: { id: 'u' } }, 201);
  await dashboardApi.register('USER@EXAMPLE.COM', 'a secure password', 'Ada');
  const c = called();
  assert.match(c.url, /\/auth\/register$/);
  assert.equal(c.init.method, 'POST');
  assert.deepEqual(JSON.parse(c.init.body), {
    email: 'USER@EXAMPLE.COM',
    password: 'a secure password',
    displayName: 'Ada',
  });
});

test('onboarding calls the atomic organizations endpoint', async () => {
  const called = mock({ organization: {}, membership: {}, business: {} }, 201);
  await dashboardApi.createOrganization('token', {
    organizationName: 'Studio',
    business: {
      name: 'Studio',
      slug: 'studio',
      timezone: 'Europe/Paris',
      defaultCurrency: 'EUR',
    },
  });
  const c = called();
  assert.match(c.url, /\/organizations$/);
  assert.equal(c.init.method, 'POST');
  assert.equal(c.init.headers.Authorization, 'Bearer token');
});

test('draft scheduling preserves zero and positive buffers', async () => {
  const called = mock({ id: 'revision' });
  await dashboardApi.updateDraft('token', 'experience', {
    schedulingMode: 'GENERATED_SLOTS',
    durationMinutes: 30,
    slotIntervalMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
  });
  assert.deepEqual(JSON.parse(called().init.body), {
    schedulingMode: 'GENERATED_SLOTS',
    durationMinutes: 30,
    slotIntervalMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
  });
});

test('media delivery is verified before upload success is shown', async () => {
  globalThis.fetch = async () =>
    new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    });
  await verifyDashboardMedia('11111111-1111-4111-8111-111111111111');

  globalThis.fetch = async () =>
    new Response(null, {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  await assert.rejects(
    () => verifyDashboardMedia('11111111-1111-4111-8111-111111111111'),
    /Image could not be loaded/,
  );
});
