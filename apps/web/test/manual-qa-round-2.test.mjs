/* global URL */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  shouldAutoSelectOccurrence,
  singleEventStatus,
} from '../lib/event-availability.ts';

const occurrence = (changes = {}) => ({
  id: 'event-1',
  startAt: '2030-10-10T18:00:00.000Z',
  endAt: '2030-10-10T20:00:00.000Z',
  timezone: 'Europe/Paris',
  capacity: 100,
  remainingCapacity: 100,
  bookingClosesAt: null,
  bookable: true,
  ...changes,
});

test('one future explicit event is automatically selectable', () => {
  assert.equal(shouldAutoSelectOccurrence([occurrence()], true), true);
  assert.equal(
    shouldAutoSelectOccurrence(
      [occurrence(), occurrence({ id: 'event-2' })],
      true,
    ),
    false,
  );
});

test('single-event status distinguishes closed, sold out, ended, and booking-window closed', () => {
  assert.equal(singleEventStatus(occurrence(), false), 'closed');
  assert.equal(
    singleEventStatus(
      occurrence({ remainingCapacity: 0, bookable: false }),
      true,
    ),
    'sold_out',
  );
  assert.equal(
    singleEventStatus(occurrence({ endAt: '2020-01-01T00:00:00.000Z' }), true),
    'ended',
  );
  assert.equal(
    singleEventStatus(
      occurrence({
        bookingClosesAt: '2020-01-01T00:00:00.000Z',
        bookable: false,
      }),
      true,
    ),
    'closed',
  );
});

test('builder exposes pending choice options and media feedback in the edit flow', async () => {
  const [fields, blocks] = await Promise.all([
    readFile(
      new URL('../app/dashboard/field-editor.tsx', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../app/dashboard/page-block-editor.tsx', import.meta.url),
      'utf8',
    ),
  ]);
  assert.match(fields, /Add at least one option/);
  assert.match(fields, /\+ Add option/);
  assert.match(fields, /Stable option key/);
  assert.match(fields, /checkbox records an explicit yes\/no answer/i);
  assert.match(blocks, /Brand assets/);
  assert.match(blocks, /Upload logo|Replace logo/);
  assert.match(blocks, /Background image/);
  assert.match(blocks, /galleryMediaIds|Gallery/);
});

test('booking flow uses event and session language and blocks an unavailable continue action', async () => {
  const source = await readFile(
    new URL(
      '../app/[businessSlug]/[experienceSlug]/booking-flow.tsx',
      import.meta.url,
    ),
    'utf8',
  );
  assert.match(source, /Choose a session/);
  assert.match(source, /Event details/);
  assert.match(source, /singleEventReady/);
  assert.match(source, /visibleSlots\.some/);
});
