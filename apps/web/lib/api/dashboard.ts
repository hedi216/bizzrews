const API_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'
).replace(/\/$/, '');

export type User = { id: string; email: string; displayName: string | null };
export type Business = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  timezone: string;
  defaultCurrency: string;
  marketplaceVisibility: 'UNLISTED' | 'LISTED';
};
export type Organization = {
  id: string;
  name: string;
  role: 'OWNER' | 'MANAGER' | 'STAFF';
  membershipId: string;
  businesses: Business[];
};
export type Experience = {
  id: string;
  slug: string;
  acceptingReservations: boolean;
  publishedRevisionId: string | null;
  publishedRevision: Revision | null;
  draft: Revision | null;
  business?: { id: string; name: string; slug: string };
};
export type Revision = {
  id: string;
  version: number;
  name: string;
  description: string | null;
  cancellationTerms: string | null;
  priceAmount: string;
  currency: string;
  publishedAt: string | null;
  schedulingMode: 'EXPLICIT_OCCURRENCES' | 'GENERATED_SLOTS';
  durationMinutes?: number | null;
  slotIntervalMinutes?: number | null;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  fields?: Array<{
    id: string;
    key: string;
    label: string;
    type: string;
    required: boolean;
    position: number;
    placeholder: string | null;
    helpText: string | null;
    validation: unknown;
    options: Array<{
      id: string;
      key: string;
      label: string;
      position: number;
    }>;
  }>;
  pageBlocks?: PageBlock[];
};
export type PageBlockType =
  'HERO' | 'TEXT' | 'GALLERY' | 'LOCATION' | 'ITINERARY' | 'FORM' | 'CTA';
export type PageBlock = {
  id: string;
  type: PageBlockType;
  position: number;
  config: Record<string, unknown>;
};
export type DraftField = NonNullable<Revision['fields']>[number];
export const fieldTypes = [
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'SELECT',
  'RADIO',
  'CHECKBOX',
  'MULTISELECT',
  'DATE',
  'TIME',
] as const;
export type Resource = {
  id: string;
  businessId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
export type WeeklyWindow = {
  id?: string;
  dayOfWeek:
    | 'MONDAY'
    | 'TUESDAY'
    | 'WEDNESDAY'
    | 'THURSDAY'
    | 'FRIDAY'
    | 'SATURDAY'
    | 'SUNDAY';
  start: string;
  end: string;
};
export type AvailabilityOverride = {
  id: string;
  date: string;
  available: boolean;
  start: string | null;
  end: string | null;
};
export type Occurrence = {
  id: string;
  experienceId: string;
  resourceId: string | null;
  startAt: string;
  endAt: string;
  timezone: string;
  capacity: number;
  bookingClosesAt: string | null;
  cancelledAt: string | null;
  reservedParticipants: number;
  remainingCapacity: number;
};
export type Reservation = {
  id: string;
  status: 'CONFIRMED' | 'CANCELLED';
  customerFullName: string;
  customerPhone: string;
  customerEmail: string;
  startAt: string;
  endAt: string;
  timezone: string;
  participantCount: number;
  totalAmount: string;
  currency: string;
  createdAt: string;
  answers: Array<{ value: unknown; definitionSnapshot: unknown }>;
};
export type CustomerReservation = {
  id: string;
  status: 'CONFIRMED' | 'CANCELLED';
  startAt: string;
  endAt: string;
  timezone: string;
  participantCount: number;
  totalAmount: string;
  currency: string;
  experienceSnapshot: unknown;
  createdAt: string;
};
export type CustomerLoyaltyAccount = {
  id: string;
  balance: number;
  updatedAt: string;
  business: { id: string; name: string; slug: string };
  transactions: Array<{
    id: string;
    type: 'EARN' | 'SPEND';
    pointsDelta: number;
    balanceAfter: number;
    description: string | null;
    createdAt: string;
  }>;
};

export class DashboardApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
async function parse<T>(response: Response): Promise<T> {
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
    throw new DashboardApiError(response.status, message);
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}
async function request<T>(
  path: string,
  token?: string,
  init?: RequestInit,
): Promise<T> {
  return parse<T>(
    await fetch(`${API_URL}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    }),
  );
}

export const dashboardApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; expiresIn: number; user: User }>(
      '/auth/login',
      undefined,
      { method: 'POST', body: JSON.stringify({ email, password }) },
    ),
  refresh: () =>
    request<{ accessToken: string; expiresIn: number }>(
      '/auth/refresh',
      undefined,
      { method: 'POST' },
    ),
  logout: () => request<void>('/auth/logout', undefined, { method: 'POST' }),
  me: (token: string) => request<User>('/auth/me', token),
  customerReservations: (token: string) =>
    request<{ reservations: CustomerReservation[] }>(
      '/customers/me/reservations',
      token,
    ),
  customerLoyalty: (token: string) =>
    request<{ accounts: CustomerLoyaltyAccount[] }>(
      '/customers/me/loyalty',
      token,
    ),
  updateCustomerProfile: (token: string, displayName: string | null) =>
    request<User>('/customers/me/profile', token, {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    }),
  organizations: (token: string) =>
    request<{ organizations: Organization[] }>('/organizations', token),
  experiences: (token: string, businessId: string) =>
    request<{ experiences: Experience[] }>(
      `/businesses/${businessId}/experiences`,
      token,
    ),
  experience: (token: string, id: string) =>
    request<Experience>(`/experiences/${id}`, token),
  updateBusiness: (
    token: string,
    businessId: string,
    body: Partial<
      Pick<
        Business,
        'name' | 'slug' | 'description' | 'timezone' | 'defaultCurrency'
      >
    >,
  ) =>
    request<Business>(`/businesses/${businessId}`, token, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  createExperience: (
    token: string,
    businessId: string,
    body: {
      slug: string;
      name: string;
      description?: string | null;
      priceAmount?: string;
      currency?: string;
    },
  ) =>
    request<{ experience: Experience; draft: Revision }>(
      `/businesses/${businessId}/experiences`,
      token,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  updateDraft: (
    token: string,
    experienceId: string,
    body: Partial<
      Pick<
        Revision,
        | 'name'
        | 'description'
        | 'cancellationTerms'
        | 'priceAmount'
        | 'currency'
        | 'schedulingMode'
      >
    > & {
      durationMinutes?: number;
      slotIntervalMinutes?: number;
      bufferBeforeMinutes?: number;
      bufferAfterMinutes?: number;
    },
  ) =>
    request<Revision>(`/experiences/${experienceId}/draft`, token, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  publish: (token: string, experienceId: string) =>
    request(`/experiences/${experienceId}/publish`, token, { method: 'POST' }),
  createDraft: (token: string, experienceId: string) =>
    request(`/experiences/${experienceId}/draft`, token, { method: 'POST' }),
  setReservations: (token: string, experienceId: string, open: boolean) =>
    request(
      `/experiences/${experienceId}/reservations/${open ? 'open' : 'close'}`,
      token,
      { method: 'POST' },
    ),
  createField: (
    token: string,
    experienceId: string,
    body: {
      key: string;
      label: string;
      type: (typeof fieldTypes)[number];
      required: boolean;
      position: number;
    },
  ) =>
    request<DraftField>(`/experiences/${experienceId}/draft/fields`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteField: (token: string, experienceId: string, fieldId: string) =>
    request<void>(
      `/experiences/${experienceId}/draft/fields/${fieldId}`,
      token,
      { method: 'DELETE' },
    ),
  updateField: (
    token: string,
    experienceId: string,
    fieldId: string,
    body: Record<string, unknown>,
  ) =>
    request<DraftField>(
      `/experiences/${experienceId}/draft/fields/${fieldId}`,
      token,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  createOption: (
    token: string,
    experienceId: string,
    fieldId: string,
    body: { key: string; label: string; position: number },
  ) =>
    request<DraftField['options'][number]>(
      `/experiences/${experienceId}/draft/fields/${fieldId}/options`,
      token,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  deleteOption: (
    token: string,
    experienceId: string,
    fieldId: string,
    optionId: string,
  ) =>
    request<void>(
      `/experiences/${experienceId}/draft/fields/${fieldId}/options/${optionId}`,
      token,
      { method: 'DELETE' },
    ),
  updateOption: (
    token: string,
    experienceId: string,
    fieldId: string,
    optionId: string,
    body: Record<string, unknown>,
  ) =>
    request<DraftField['options'][number]>(
      `/experiences/${experienceId}/draft/fields/${fieldId}/options/${optionId}`,
      token,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  resources: (token: string, businessId: string) =>
    request<{ resources: Resource[] }>(
      `/businesses/${businessId}/resources`,
      token,
    ),
  assignments: (token: string, experienceId: string) =>
    request<{ resources: Array<Resource & { assignmentActive: boolean }> }>(
      `/experiences/${experienceId}/resources`,
      token,
    ),
  assignResource: (token: string, experienceId: string, resourceId: string) =>
    request(`/experiences/${experienceId}/resources/${resourceId}`, token, {
      method: 'POST',
    }),
  unassignResource: (token: string, experienceId: string, resourceId: string) =>
    request<void>(
      `/experiences/${experienceId}/resources/${resourceId}`,
      token,
      { method: 'DELETE' },
    ),
  createResource: (token: string, businessId: string, name: string) =>
    request<Resource>(`/businesses/${businessId}/resources`, token, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  updateResource: (
    token: string,
    id: string,
    body: Partial<Pick<Resource, 'name' | 'active'>>,
  ) =>
    request<Resource>(`/resources/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  weekly: (token: string, id: string) =>
    request<{ windows: WeeklyWindow[] }>(
      `/resources/${id}/weekly-availability`,
      token,
    ),
  replaceWeekly: (token: string, id: string, windows: WeeklyWindow[]) =>
    request<{ windows: WeeklyWindow[] }>(
      `/resources/${id}/weekly-availability`,
      token,
      {
        method: 'PUT',
        body: JSON.stringify({
          windows: windows.map(({ dayOfWeek, start, end }) => ({
            dayOfWeek,
            start,
            end,
          })),
        }),
      },
    ),
  overrides: (token: string, id: string) =>
    request<{ overrides: AvailabilityOverride[] }>(
      `/resources/${id}/availability-overrides`,
      token,
    ),
  putOverride: (
    token: string,
    id: string,
    date: string,
    body: { available: boolean; start?: string; end?: string },
  ) =>
    request<AvailabilityOverride>(
      `/resources/${id}/availability-overrides/${date}`,
      token,
      { method: 'PUT', body: JSON.stringify(body) },
    ),
  occurrences: (token: string, id: string) =>
    request<{ occurrences: Occurrence[] }>(
      `/experiences/${id}/occurrences`,
      token,
    ),
  createOccurrence: (
    token: string,
    id: string,
    body: {
      startAt: string;
      endAt: string;
      timezone?: string;
      capacity: number;
    },
  ) =>
    request<Occurrence>(`/experiences/${id}/occurrences`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  cancelOccurrence: (token: string, id: string) =>
    request<Occurrence>(`/occurrences/${id}/cancel`, token, { method: 'POST' }),
  reservations: (token: string, id: string) =>
    request<{ reservations: Reservation[] }>(
      `/experiences/${id}/reservations`,
      token,
    ),
  cancelReservation: (token: string, id: string, reason?: string) =>
    request<Reservation>(`/reservations/${id}/cancel`, token, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || null }),
    }),
  createPageBlock: (
    token: string,
    experienceId: string,
    body: Omit<PageBlock, 'id'>,
  ) =>
    request<PageBlock>(
      `/experiences/${experienceId}/draft/page-blocks`,
      token,
      { method: 'POST', body: JSON.stringify(body) },
    ),
  updatePageBlock: (
    token: string,
    experienceId: string,
    id: string,
    body: Partial<Omit<PageBlock, 'id'>>,
  ) =>
    request<PageBlock>(
      `/experiences/${experienceId}/draft/page-blocks/${id}`,
      token,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),
  deletePageBlock: (token: string, experienceId: string, id: string) =>
    request<void>(
      `/experiences/${experienceId}/draft/page-blocks/${id}`,
      token,
      { method: 'DELETE' },
    ),
};
