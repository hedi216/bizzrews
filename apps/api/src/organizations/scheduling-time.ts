import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { LOCAL_DATE, LOCAL_TIME } from './dto/scheduling.dto';

export const timeValue = (value: string) =>
  new Date(`1970-01-01T${value}:00.000Z`);
export const timeText = (value: Date) => value.toISOString().slice(11, 16);
export const dateValue = (value: string) => new Date(`${value}T00:00:00.000Z`);
export const dateText = (value: Date) => value.toISOString().slice(0, 10);
export function validateDate(value: string): void {
  if (!LOCAL_DATE.test(value) || !DateTime.fromISO(value).isValid)
    throw new BadRequestException('Invalid local date.');
}
export function validateWindow(start?: string, end?: string): void {
  if (
    !start ||
    !end ||
    !LOCAL_TIME.test(start) ||
    !LOCAL_TIME.test(end) ||
    start >= end
  )
    throw new BadRequestException('Invalid availability window.');
}
export function zonedInstant(
  date: string,
  time: string,
  zone: string,
): DateTime {
  const value = DateTime.fromISO(`${date}T${time}`, { zone });
  if (
    !value.isValid ||
    value.toFormat('yyyy-LL-dd') !== date ||
    value.toFormat('HH:mm') !== time
  )
    throw new BadRequestException(
      'Local time does not exist in this timezone.',
    );
  return value;
}
