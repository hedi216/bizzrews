import type { PublicOccurrence } from './api/public-booking';

export type SingleEventStatus = 'available' | 'closed' | 'sold_out' | 'ended';

export function singleEventStatus(
  occurrence: PublicOccurrence,
  acceptingReservations: boolean,
  now = new Date(),
): SingleEventStatus {
  if (new Date(occurrence.endAt) <= now) return 'ended';
  if (occurrence.remainingCapacity <= 0) return 'sold_out';
  if (
    !acceptingReservations ||
    !occurrence.bookable ||
    (occurrence.bookingClosesAt && new Date(occurrence.bookingClosesAt) <= now)
  )
    return 'closed';
  return 'available';
}

export function shouldAutoSelectOccurrence(
  occurrences: PublicOccurrence[],
  acceptingReservations: boolean,
  now = new Date(),
) {
  return (
    occurrences.length === 1 &&
    singleEventStatus(occurrences[0]!, acceptingReservations, now) ===
      'available'
  );
}
