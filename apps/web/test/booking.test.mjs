import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReservationPayload,
  compareDecimal,
  customerErrors,
  todayInZone,
  validateAnswer,
} from '../lib/booking.ts';
const field = (type, extra = {}) => ({
  id: 'f',
  key: 'question',
  label: 'Question',
  type,
  required: false,
  position: 0,
  placeholder: null,
  helpText: null,
  validation: null,
  options: [],
  ...extra,
});
test('recognizes explicit and generated payloads', () => {
  const customer = {
    fullName: ' Ada ',
    phone: ' +216 ',
    email: ' ada@example.com ',
  };
  const occurrence = {
    id: 'o',
    startAt: '2030-01-01T09:00:00Z',
    endAt: '2030-01-01T10:00:00Z',
    timezone: 'UTC',
    capacity: 3,
    remainingCapacity: 3,
    bookingClosesAt: null,
    bookable: true,
  };
  assert.deepEqual(
    buildReservationPayload(
      customer,
      { mode: 'EXPLICIT_OCCURRENCES', occurrence, participantCount: 2 },
      {},
    ).booking,
    { occurrenceId: 'o', participantCount: 2 },
  );
  const slot = {
    resource: { id: 'r', name: 'Room' },
    startAt: '2030-01-01T09:00:00Z',
    endAt: '2030-01-01T10:00:00Z',
    localStart: '09:00',
    localEnd: '10:00',
    bookable: true,
  };
  assert.deepEqual(
    buildReservationPayload(
      customer,
      { mode: 'GENERATED_SLOTS', slot, participantCount: 1 },
      {},
    ).booking,
    { slot: { resourceId: 'r', startAt: slot.startAt }, participantCount: 1 },
  );
});
test('keeps system data separate from answers and number strings exact', () => {
  const payload = buildReservationPayload(
    { fullName: 'Ada', phone: '+1', email: 'a@b.co' },
    {
      mode: 'GENERATED_SLOTS',
      slot: {
        resource: { id: 'r', name: 'R' },
        startAt: '2030-01-01T09:00:00Z',
        endAt: 'x',
        localStart: '09:00',
        localEnd: '10:00',
        bookable: true,
      },
      participantCount: 1,
    },
    { amount: '100.123456789' },
  );
  assert.equal(payload.answers.amount, '100.123456789');
  assert.equal('fullName' in payload.answers, false);
});
test('validates text and textarea lengths', () => {
  assert.match(
    validateAnswer(
      field('TEXT', { required: true, validation: { minLength: 2 } }),
      '',
    ) ?? '',
    /required/,
  );
  assert.match(
    validateAnswer(
      field('TEXTAREA', { validation: { maxLength: 2 } }),
      'long',
    ) ?? '',
    /no more/,
  );
});
test('validates exact decimal bounds and places', () => {
  assert.equal(compareDecimal('100.01', '100.001'), 1);
  assert.match(
    validateAnswer(
      field('NUMBER', {
        validation: { minimum: '0', maximum: '2', decimalPlaces: 2 },
      }),
      '2.001',
    ) ?? '',
    /at most|decimal|or less/,
  );
});
test('select and radio use option keys', () => {
  const options = [{ id: '1', key: 'yes', label: 'Yes', position: 0 }];
  assert.equal(validateAnswer(field('SELECT', { options }), 'yes'), null);
  assert.ok(validateAnswer(field('RADIO', { options }), 'Yes'));
});
test('required checkbox accepts explicit false', () =>
  assert.equal(
    validateAnswer(field('CHECKBOX', { required: true }), false),
    null,
  ));
test('multiselect accepts unique option keys', () => {
  const options = [{ id: '1', key: 'a', label: 'A', position: 0 }];
  assert.equal(validateAnswer(field('MULTISELECT', { options }), ['a']), null);
  assert.ok(validateAnswer(field('MULTISELECT', { options }), ['a', 'a']));
});
test('date and time are canonical', () => {
  assert.equal(validateAnswer(field('DATE'), '2028-02-29'), null);
  assert.ok(validateAnswer(field('DATE'), '02/29/2028'));
  assert.ok(validateAnswer(field('DATE'), '2028-02-31'));
  assert.equal(validateAnswer(field('TIME'), '23:59'), null);
  assert.ok(validateAnswer(field('TIME'), '24:00'));
});
test('required customer validation covers identity', () =>
  assert.deepEqual(
    Object.keys(customerErrors({ fullName: '', phone: '', email: 'bad' })),
    ['fullName', 'phone', 'email'],
  ));
test('timezone date is deterministic', () =>
  assert.equal(
    todayInZone('Pacific/Honolulu', new Date('2030-01-02T05:00:00Z')),
    '2030-01-01',
  ));
