export type SchedulingMode = 'EXPLICIT_OCCURRENCES' | 'GENERATED_SLOTS';
export type FieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'SELECT'
  | 'RADIO'
  | 'CHECKBOX'
  | 'MULTISELECT'
  | 'DATE'
  | 'TIME';

export type FieldOption = {
  id: string;
  key: string;
  label: string;
  position: number;
};
export type PublicField = {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  position: number;
  placeholder: string | null;
  helpText: string | null;
  validation: Record<string, unknown> | null;
  options: FieldOption[];
};
export type PublicExperience = {
  business: {
    name: string;
    slug: string;
    timezone: string;
    defaultCurrency: string;
  };
  experience: { id: string; slug: string; acceptingReservations: boolean };
  publishedRevision: {
    version: number;
    name: string;
    description: string | null;
    cancellationTerms: string | null;
    priceAmount: string;
    currency: string;
    paymentMode: 'NONE' | 'OPTIONAL' | 'REQUIRED' | 'DEPOSIT';
    depositAmount: string | null;
    publishedAt: string;
    schedulingMode: SchedulingMode;
    durationMinutes: number | null;
    slotIntervalMinutes: number | null;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
  };
  fields: PublicField[];
  pageBlocks: Array<{
    id: string;
    type:
      'HERO' | 'TEXT' | 'GALLERY' | 'LOCATION' | 'ITINERARY' | 'FORM' | 'CTA';
    position: number;
    config: Record<string, unknown>;
  }>;
};
export type PublicOccurrence = {
  id: string;
  startAt: string;
  endAt: string;
  timezone: string;
  capacity: number;
  remainingCapacity: number;
  bookingClosesAt: string | null;
  bookable: boolean;
};
export type PublicSlot = {
  resource: { id: string; name: string };
  startAt: string;
  endAt: string;
  localStart: string;
  localEnd: string;
  bookable: boolean;
};
export type ReservationPayload = {
  customer: { fullName: string; phone: string; email: string };
  booking:
    | { occurrenceId: string; participantCount: number }
    | { slot: { resourceId: string; startAt: string }; participantCount: 1 };
  answers: Record<string, unknown>;
};
export type ReservationResult = {
  reservation: {
    id: string;
    status: 'CONFIRMED';
    customerFullName: string;
    startAt: string;
    endAt: string;
    timezone: string;
    participantCount: number;
    totalAmount: string;
    currency: string;
  };
};
export type MarketplaceBusiness = {
  name: string;
  slug: string;
  description: string | null;
  timezone: string;
  experiences: Array<{
    slug: string;
    acceptingReservations: boolean;
    publishedRevision: {
      name: string;
      description: string | null;
      priceAmount: string;
      currency: string;
      paymentMode: 'NONE' | 'OPTIONAL' | 'REQUIRED' | 'DEPOSIT';
      depositAmount: string | null;
    };
  }>;
};

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
).replace(/\/$/, '');

export class PublicApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    cache: 'no-store',
  });
  if (!response.ok) {
    let message = 'Request failed.';
    try {
      const body = (await response.json()) as { message?: string | string[] };
      message = Array.isArray(body.message)
        ? body.message.join(' ')
        : (body.message ?? message);
    } catch {
      message = 'Request failed.';
    }
    throw new PublicApiError(response.status, message);
  }
  return (await response.json()) as T;
}

const base = (businessSlug: string, experienceSlug: string) =>
  `/public/businesses/${encodeURIComponent(businessSlug)}/experiences/${encodeURIComponent(experienceSlug)}`;

export const publicBookingApi = {
  marketplace: (query = '') =>
    request<{ businesses: MarketplaceBusiness[] }>(
      `/marketplace${query ? `?query=${encodeURIComponent(query)}` : ''}`,
    ),
  experience: (businessSlug: string, experienceSlug: string) =>
    request<PublicExperience>(base(businessSlug, experienceSlug)),
  occurrences: (businessSlug: string, experienceSlug: string) =>
    request<{ occurrences: PublicOccurrence[] }>(
      `${base(businessSlug, experienceSlug)}/occurrences`,
    ),
  slots: (businessSlug: string, experienceSlug: string, date: string) =>
    request<{ date: string; timezone: string; slots: PublicSlot[] }>(
      `${base(businessSlug, experienceSlug)}/slots?date=${encodeURIComponent(date)}`,
    ),
  reserve: (
    businessSlug: string,
    experienceSlug: string,
    payload: ReservationPayload,
    accessToken?: string,
  ) =>
    request<ReservationResult>(
      `${base(businessSlug, experienceSlug)}/reservations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(payload),
      },
    ),
};
