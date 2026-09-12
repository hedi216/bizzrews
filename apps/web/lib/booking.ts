import type {
  PublicField,
  PublicOccurrence,
  PublicSlot,
  ReservationPayload,
} from './api/public-booking';

export type AnswerValue = string | boolean | string[] | undefined;
export type CustomerDetails = {
  fullName: string;
  phone: string;
  email: string;
};
export type BookingSelection =
  | {
      mode: 'EXPLICIT_OCCURRENCES';
      occurrence: PublicOccurrence;
      participantCount: number;
    }
  | { mode: 'GENERATED_SLOTS'; slot: PublicSlot; participantCount: 1 };

export function todayInZone(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((x) => x.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function money(amount: string, currency: string): string {
  if (/^0(?:\.0+)?$/.test(amount)) return 'Free';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(Number(amount));
  } catch {
    return `${amount} ${currency}`;
  }
}

function decimalParts(value: string) {
  const negative = value.startsWith('-');
  const [integer = '0', fraction = ''] = (
    negative ? value.slice(1) : value
  ).split('.');
  return {
    negative,
    integer: integer.replace(/^0+(?=\d)/, ''),
    fraction: fraction.replace(/0+$/, ''),
  };
}

export function compareDecimal(a: string, b: string): number {
  const x = decimalParts(a),
    y = decimalParts(b);
  if (x.negative !== y.negative) return x.negative ? -1 : 1;
  const sign = x.negative ? -1 : 1;
  if (x.integer.length !== y.integer.length)
    return x.integer.length > y.integer.length ? sign : -sign;
  const width = Math.max(x.fraction.length, y.fraction.length);
  const left = `${x.integer}.${x.fraction.padEnd(width, '0')}`;
  const right = `${y.integer}.${y.fraction.padEnd(width, '0')}`;
  return left === right ? 0 : left > right ? sign : -sign;
}

export function validateAnswer(
  field: PublicField,
  value: AnswerValue,
): string | null {
  const missing =
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0);
  if (field.required && missing) return `${field.label} is required.`;
  if (missing) return null;
  const rules = field.validation ?? {};
  if (field.type === 'TEXT' || field.type === 'TEXTAREA') {
    if (typeof value !== 'string') return 'Enter text.';
    const min =
      typeof rules.minLength === 'number' ? rules.minLength : undefined;
    const max =
      typeof rules.maxLength === 'number' ? rules.maxLength : undefined;
    if (min !== undefined && value.length < min)
      return `Enter at least ${min} characters.`;
    if (max !== undefined && value.length > max)
      return `Use no more than ${max} characters.`;
  }
  if (field.type === 'NUMBER') {
    if (
      typeof value !== 'string' ||
      !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
    )
      return 'Enter a valid number.';
    if (
      typeof rules.minimum === 'string' &&
      compareDecimal(value, rules.minimum) < 0
    )
      return `Enter ${rules.minimum} or more.`;
    if (
      typeof rules.maximum === 'string' &&
      compareDecimal(value, rules.maximum) > 0
    )
      return `Enter ${rules.maximum} or less.`;
    if (
      typeof rules.decimalPlaces === 'number' &&
      (value.split('.')[1]?.length ?? 0) > rules.decimalPlaces
    )
      return `Use at most ${rules.decimalPlaces} decimal places.`;
  }
  if (
    (field.type === 'SELECT' || field.type === 'RADIO') &&
    (typeof value !== 'string' || !field.options.some((x) => x.key === value))
  )
    return 'Choose a valid option.';
  if (field.type === 'CHECKBOX' && typeof value !== 'boolean')
    return 'Choose yes or no.';
  if (
    field.type === 'MULTISELECT' &&
    (!Array.isArray(value) ||
      new Set(value).size !== value.length ||
      value.some((key) => !field.options.some((x) => x.key === key)))
  )
    return 'Choose valid options.';
  if (
    field.type === 'DATE' &&
    (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)
  )
    return 'Choose a valid date.';
  if (
    field.type === 'TIME' &&
    (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
  )
    return 'Choose a valid time.';
  return null;
}

export function buildReservationPayload(
  customer: CustomerDetails,
  selection: BookingSelection,
  answers: Record<string, AnswerValue>,
): ReservationPayload {
  const cleanAnswers = Object.fromEntries(
    Object.entries(answers).filter(([, value]) => value !== undefined),
  );
  return {
    customer: {
      fullName: customer.fullName.trim(),
      phone: customer.phone.trim(),
      email: customer.email.trim(),
    },
    booking:
      selection.mode === 'EXPLICIT_OCCURRENCES'
        ? {
            occurrenceId: selection.occurrence.id,
            participantCount: selection.participantCount,
          }
        : {
            slot: {
              resourceId: selection.slot.resource.id,
              startAt: selection.slot.startAt,
            },
            participantCount: 1,
          },
    answers: cleanAnswers,
  };
}

export function customerErrors(
  customer: CustomerDetails,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!customer.fullName.trim()) errors.fullName = 'Full name is required.';
  if (!customer.phone.trim()) errors.phone = 'Phone is required.';
  if (!/^\S+@\S+\.\S+$/.test(customer.email.trim()))
    errors.email = 'Enter a valid email address.';
  return errors;
}
