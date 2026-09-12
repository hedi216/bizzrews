/* global Response */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardApi, DashboardApiError } from '../lib/api/dashboard.ts';
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
