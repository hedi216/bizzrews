/* global File, FormData, Response */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fieldKey,
  fieldTypeLabel,
  slugify,
  uniqueKey,
} from '../lib/builder-utils.ts';
import { dashboardApi } from '../lib/api/dashboard.ts';

test('business labels become canonical slugs and internal field keys', () => {
  assert.equal(slugify('  Café & Ceramic Workshop  '), 'cafe-ceramic-workshop');
  assert.equal(fieldKey('Dietary restrictions'), 'dietary_restrictions');
  assert.equal(fieldKey('21+ guests'), 'question_21_guests');
});

test('duplicate generated field and option keys receive deterministic suffixes', () => {
  assert.equal(uniqueKey('Preferred color', []), 'preferred_color');
  assert.equal(
    uniqueKey('Preferred color', ['preferred_color']),
    'preferred_color_2',
  );
  assert.equal(
    uniqueKey('Preferred color', ['preferred_color', 'preferred_color_2']),
    'preferred_color_3',
  );
});

test('all custom question types have business-friendly names', () => {
  assert.deepEqual(Object.keys(fieldTypeLabel), [
    'TEXT',
    'TEXTAREA',
    'NUMBER',
    'SELECT',
    'RADIO',
    'CHECKBOX',
    'MULTISELECT',
    'DATE',
    'TIME',
  ]);
  assert.equal(fieldTypeLabel.RADIO, 'Single choice');
});

test('media upload uses multipart data without forcing a JSON content type', async () => {
  let call;
  globalThis.fetch = async (url, init) => {
    call = { url: String(url), init };
    return new Response(
      JSON.stringify({
        id: 'm',
        originalName: 'a.png',
        mimeType: 'image/png',
        sizeBytes: 8,
        url: '/m',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  };
  await dashboardApi.uploadMedia(
    'access',
    'business',
    new File([new Uint8Array([1])], 'a.png', { type: 'image/png' }),
  );
  assert.match(call.url, /\/businesses\/business\/media$/);
  assert.equal(call.init.method, 'POST');
  assert.ok(call.init.body instanceof FormData);
  assert.equal(call.init.headers['Content-Type'], undefined);
});
