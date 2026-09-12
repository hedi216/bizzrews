import { BadRequestException } from '@nestjs/common';
import { RESERVED_FIELD_KEYS, type FieldTypeValue } from './dto/field.dto';

const DECIMAL = /^-?(?:0|[1-9]\d{0,14})(?:\.\d{1,8})?$/;
const reservedPrefixes = [
  'system_',
  'customer_',
  'booking_',
  'reservation_',
  'payment_',
];
export const optionTypes: FieldTypeValue[] = ['SELECT', 'RADIO', 'MULTISELECT'];

export function validateFieldKey(key: string): void {
  if (
    RESERVED_FIELD_KEYS.includes(key) ||
    reservedPrefixes.some((prefix) => key.startsWith(prefix))
  )
    throw new BadRequestException('Field key is reserved.');
}
export function validateFieldRules(
  type: FieldTypeValue,
  value: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  const rules = value ?? {};
  const keys = Object.keys(rules);
  if (type === 'TEXT' || type === 'TEXTAREA') {
    if (keys.some((key) => !['minLength', 'maxLength'].includes(key)))
      throw new BadRequestException('Unsupported validation rule.');
    const min = rules.minLength,
      max = rules.maxLength;
    if (min !== undefined && (!Number.isInteger(min) || Number(min) < 0))
      throw new BadRequestException('Invalid minLength.');
    if (max !== undefined && (!Number.isInteger(max) || Number(max) < 1))
      throw new BadRequestException('Invalid maxLength.');
    if (min !== undefined && max !== undefined && Number(min) > Number(max))
      throw new BadRequestException('minLength exceeds maxLength.');
  } else if (type === 'NUMBER') {
    if (
      keys.some((key) => !['minimum', 'maximum', 'decimalPlaces'].includes(key))
    )
      throw new BadRequestException('Unsupported validation rule.');
    for (const key of ['minimum', 'maximum'])
      if (
        rules[key] !== undefined &&
        (typeof rules[key] !== 'string' || !DECIMAL.test(rules[key]))
      )
        throw new BadRequestException(`Invalid ${key}.`);
    const places = rules.decimalPlaces;
    if (
      places !== undefined &&
      (!Number.isInteger(places) || Number(places) < 0 || Number(places) > 8)
    )
      throw new BadRequestException('Invalid decimalPlaces.');
    if (
      typeof rules.minimum === 'string' &&
      typeof rules.maximum === 'string' &&
      compareDecimal(rules.minimum, rules.maximum) > 0
    )
      throw new BadRequestException('minimum exceeds maximum.');
  } else if (keys.length)
    throw new BadRequestException(
      'This field type does not support validation rules.',
    );
  return keys.length ? rules : null;
}
export function compareDecimal(a: string, b: string): number {
  const scale = (value: string) => {
    const negative = value.startsWith('-');
    const raw = negative ? value.slice(1) : value;
    const [whole, fraction = ''] = raw.split('.');
    const result = BigInt(whole + fraction.padEnd(8, '0'));
    return negative ? -result : result;
  };
  const left = scale(a),
    right = scale(b);
  return left < right ? -1 : left > right ? 1 : 0;
}
