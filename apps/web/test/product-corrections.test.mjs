import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from '../lib/safe-next.ts';
import {
  bookingBlockConfig,
  bookingBlockIndex,
} from '../lib/page-block-layout.ts';
import { onlineBookingAvailable } from '../lib/payment-availability.ts';

test('safe next accepts account and onboarding application routes', () => {
  assert.equal(safeNext('/account', '/dashboard'), '/account');
  assert.equal(safeNext('/onboarding', '/dashboard'), '/onboarding');
});

test('safe next rejects absolute, protocol-relative, and backslash routes', () => {
  assert.equal(safeNext('https://evil.test', '/dashboard'), '/dashboard');
  assert.equal(safeNext('//evil.test', '/dashboard'), '/dashboard');
  assert.equal(safeNext('/\\evil.test', '/dashboard'), '/dashboard');
});

test('booking is appended when no FORM block exists', () => {
  const blocks = [{ type: 'HERO', config: {} }];
  assert.equal(bookingBlockIndex(blocks), blocks.length);
});

test('booking uses the first FORM position and its presentation config', () => {
  const blocks = [
    { type: 'HERO', config: {} },
    {
      type: 'FORM',
      config: { heading: 'Reserve', submitLabel: 'Book this time' },
    },
    { type: 'GALLERY', config: {} },
    { type: 'FORM', config: { submitLabel: 'Duplicate' } },
  ];
  assert.equal(bookingBlockIndex(blocks), 1);
  assert.deepEqual(bookingBlockConfig(blocks), {
    heading: 'Reserve',
    submitLabel: 'Book this time',
  });
});

test('online booking is actionable only for no-payment experiences', () => {
  assert.equal(onlineBookingAvailable('NONE'), true);
  for (const mode of ['OPTIONAL', 'REQUIRED', 'DEPOSIT'])
    assert.equal(onlineBookingAvailable(mode), false);
});
