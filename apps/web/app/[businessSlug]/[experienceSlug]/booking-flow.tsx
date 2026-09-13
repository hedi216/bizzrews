'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildReservationPayload,
  customerErrors,
  money,
  todayInZone,
  validateAnswer,
  type AnswerValue,
  type BookingSelection,
  type CustomerDetails,
} from '../../../lib/booking';
import {
  PublicApiError,
  publicBookingApi,
  type PublicExperience,
  type PublicOccurrence,
  type PublicSlot,
  type ReservationResult,
} from '../../../lib/api/public-booking';
import { CustomField } from './custom-field';
import { useSession } from '../../providers';
type Step =
  'availability' | 'details' | 'questions' | 'review' | 'confirmation';
const friendly = (e: unknown) =>
  e instanceof PublicApiError
    ? e.status === 429
      ? 'Too many attempts. Please wait and try again.'
      : e.status >= 500
        ? 'BizzRes is temporarily unavailable. Please try again.'
        : e.message
    : 'BizzRes is temporarily unavailable. Please try again.';

export function BookingFlow({
  data,
  submitLabel = 'Confirm reservation',
}: {
  data: PublicExperience;
  submitLabel?: string;
}) {
  const session = useSession();
  const { business, experience, publishedRevision: revision, fields } = data;
  const generated = revision.schedulingMode === 'GENERATED_SLOTS';
  const [step, setStep] = useState<Step>('availability');
  const [occurrences, setOccurrences] = useState<PublicOccurrence[]>([]),
    [slots, setSlots] = useState<PublicSlot[]>([]);
  const [date, setDate] = useState(() => todayInZone(business.timezone)),
    [resource, setResource] = useState('');
  const [selection, setSelection] = useState<BookingSelection>(),
    [loading, setLoading] = useState(true);
  const [availabilityError, setAvailabilityError] = useState(''),
    [submitError, setSubmitError] = useState('');
  const [customer, setCustomer] = useState<CustomerDetails>({
    fullName: '',
    phone: '',
    email: '',
  });
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({}),
    [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false),
    [result, setResult] = useState<ReservationResult>();
  const load = useCallback(async () => {
    setLoading(true);
    setAvailabilityError('');
    try {
      if (generated)
        setSlots(
          (await publicBookingApi.slots(business.slug, experience.slug, date))
            .slots,
        );
      else
        setOccurrences(
          (await publicBookingApi.occurrences(business.slug, experience.slug))
            .occurrences,
        );
      setSelection(undefined);
    } catch (e) {
      setAvailabilityError(friendly(e));
    } finally {
      setLoading(false);
    }
  }, [business.slug, date, experience.slug, generated]);
  useEffect(() => {
    const start = setTimeout(() => void load(), 0);
    return () => clearTimeout(start);
  }, [load]);
  const resources = useMemo(
    () =>
      Array.from(
        new Map(slots.map((s) => [s.resource.id, s.resource])).values(),
      ),
    [slots],
  );
  const visibleSlots = resource
    ? slots.filter((s) => s.resource.id === resource)
    : slots;
  const steps: Step[] = fields.length
    ? ['availability', 'details', 'questions', 'review']
    : ['availability', 'details', 'review'];
  const selectedTime =
    selection?.mode === 'EXPLICIT_OCCURRENCES'
      ? {
          start: selection.occurrence.startAt,
          end: selection.occurrence.endAt,
          resource: '',
        }
      : selection
        ? {
            start: selection.slot.startAt,
            end: selection.slot.endAt,
            resource: selection.slot.resource.name,
          }
        : undefined;
  function next() {
    setErrors({});
    if (step === 'availability') {
      if (!selection)
        return setErrors({ availability: 'Choose an available time.' });
      setStep('details');
    } else if (step === 'details') {
      const found = customerErrors(customer);
      setErrors(found);
      if (!Object.keys(found).length)
        setStep(fields.length ? 'questions' : 'review');
    } else if (step === 'questions') {
      const found = Object.fromEntries(
        fields
          .map((f) => [f.key, validateAnswer(f, answers[f.key])])
          .filter((x): x is [string, string] => Boolean(x[1])),
      );
      setErrors(found);
      if (!Object.keys(found).length) setStep('review');
    }
  }
  function back() {
    setErrors({});
    setStep(
      step === 'review'
        ? fields.length
          ? 'questions'
          : 'details'
        : step === 'questions'
          ? 'details'
          : 'availability',
    );
  }
  async function submit() {
    if (!selection || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await publicBookingApi.reserve(
        business.slug,
        experience.slug,
        buildReservationPayload(customer, selection, answers),
        session.token ?? undefined,
      );
      setResult(response);
      setStep('confirmation');
    } catch (e) {
      if (e instanceof PublicApiError && e.status === 409) {
        setSubmitError(
          'This time is no longer available. Please choose another.',
        );
        setStep('availability');
        await load();
      } else setSubmitError(friendly(e));
    } finally {
      setSubmitting(false);
    }
  }
  if (step === 'confirmation' && result)
    return (
      <Confirmation
        result={result}
        experience={revision.name}
        resource={selectedTime?.resource}
        zone={business.timezone}
      />
    );
  return (
    <section className="booking-card">
      <ol className="steps" aria-label="Booking progress">
        {steps.map((s, i) => (
          <li
            key={s}
            className={
              step === s ? 'active' : i < steps.indexOf(step) ? 'complete' : ''
            }
          >
            <span>{i + 1}</span>
            {s === 'questions' ? 'Questions' : upper(s)}
          </li>
        ))}
      </ol>
      {submitError && (
        <div className="notice error" role="alert">
          {submitError}
        </div>
      )}
      {step === 'availability' && (
        <div>
          <p className="eyebrow">Availability</p>
          <h2>Choose a time</h2>
          {!experience.acceptingReservations && (
            <div className="notice">Reservations are currently closed.</div>
          )}
          {generated && (
            <div className="availability-filters">
              <FieldInput
                id="booking-date"
                label="Date"
                type="date"
                value={date}
                min={todayInZone(business.timezone)}
                onChange={(v) => {
                  setDate(v);
                  setResource('');
                }}
              />
              {resources.length > 1 && (
                <div className="field">
                  <label className="field-label" htmlFor="resource">
                    Resource
                  </label>
                  <select
                    id="resource"
                    value={resource}
                    onChange={(e) => {
                      setResource(e.target.value);
                      setSelection(undefined);
                    }}
                  >
                    <option value="">Any available resource</option>
                    {resources.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
          {loading ? (
            <div className="loading">Loading availability…</div>
          ) : availabilityError ? (
            <div className="notice error" role="alert">
              {availabilityError}
              <button className="text-button" onClick={() => void load()}>
                Try again
              </button>
            </div>
          ) : generated ? (
            <SlotList
              slots={visibleSlots}
              selection={selection}
              select={setSelection}
            />
          ) : (
            <OccurrenceList
              items={occurrences}
              zone={business.timezone}
              selection={selection}
              select={setSelection}
            />
          )}
          {selection?.mode === 'EXPLICIT_OCCURRENCES' && (
            <div className="participant">
              <label htmlFor="participants">Participants</label>
              <select
                id="participants"
                value={selection.participantCount}
                onChange={(e) =>
                  setSelection({
                    ...selection,
                    participantCount: Number(e.target.value),
                  })
                }
              >
                {Array.from(
                  { length: selection.occurrence.remainingCapacity },
                  (_, i) => i + 1,
                ).map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </div>
          )}
          {errors.availability && (
            <p className="field-error">{errors.availability}</p>
          )}
        </div>
      )}
      {step === 'details' && (
        <div>
          <p className="eyebrow">Your details</p>
          <h2>Who is booking?</h2>
          <div className="form-grid">
            <FieldInput
              id="fullName"
              label="Full name"
              value={customer.fullName}
              error={errors.fullName}
              onChange={(v) => setCustomer({ ...customer, fullName: v })}
            />
            <FieldInput
              id="phone"
              label="Phone"
              type="tel"
              value={customer.phone}
              error={errors.phone}
              onChange={(v) => setCustomer({ ...customer, phone: v })}
            />
            <FieldInput
              id="email"
              label="Email"
              type="email"
              value={customer.email}
              error={errors.email}
              onChange={(v) => setCustomer({ ...customer, email: v })}
            />
          </div>
        </div>
      )}
      {step === 'questions' && (
        <div>
          <p className="eyebrow">A little more</p>
          <h2>Custom questions</h2>
          <div className="form-grid">
            {fields.map((f) => (
              <CustomField
                key={f.id}
                field={f}
                value={answers[f.key]}
                error={errors[f.key]}
                onChange={(v) => setAnswers({ ...answers, [f.key]: v })}
              />
            ))}
          </div>
        </div>
      )}
      {step === 'review' && selection && selectedTime && (
        <div>
          <p className="eyebrow">Almost done</p>
          <h2>Review your booking</h2>
          <dl className="summary">
            <Row label="Experience" value={revision.name} />
            <Row
              label="Date and time"
              value={`${dateTime(selectedTime.start, business.timezone)} – ${time(selectedTime.end, business.timezone)}`}
            />
            {selectedTime.resource && (
              <Row label="Resource" value={selectedTime.resource} />
            )}
            <Row
              label="Participants"
              value={String(selection.participantCount)}
            />
            <Row
              label="Total"
              value={money(revision.priceAmount, revision.currency)}
            />
            <Row label="Name" value={customer.fullName} />
            {fields.map((f) => (
              <Row
                key={f.id}
                label={f.label}
                value={answerLabel(f, answers[f.key])}
              />
            ))}
          </dl>
        </div>
      )}
      <div className="actions">
        {step !== 'availability' && (
          <button className="secondary" onClick={back}>
            Back
          </button>
        )}
        {step === 'review' ? (
          <button onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Confirming…' : submitLabel}
          </button>
        ) : (
          <button onClick={next}>Continue</button>
        )}
      </div>
    </section>
  );
}
function FieldInput({
  id,
  label,
  type = 'text',
  value,
  error,
  min,
  onChange,
}: {
  id: string;
  label: string;
  type?: string;
  value: string;
  error?: string;
  min?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {id !== 'booking-date' && ' *'}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        min={min}
        autoComplete={id === 'fullName' ? 'name' : id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}
function SlotList({
  slots,
  selection,
  select,
}: {
  slots: PublicSlot[];
  selection?: BookingSelection;
  select: (x: BookingSelection) => void;
}) {
  const rows = slots.filter((x) => Lash(x));
  return rows.length ? (
    <div className="time-grid">
      {rows.map((s) => (
        <button
          className={
            selection?.mode === 'GENERATED_SLOTS' &&
            selection.slot.resource.id === s.resource.id &&
            selection.slot.startAt === s.startAt
              ? 'time-card selected'
              : 'time-card'
          }
          key={`${s.resource.id}-${s.startAt}`}
          onClick={() =>
            select({ mode: 'GENERATED_SLOTS', slot: s, participantCount: 1 })
          }
        >
          <strong>
            {s.localStart} – {s.localEnd}
          </strong>
          <span>{s.resource.name}</span>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty">No availability on this date.</div>
  );
}
function Lash(slot: PublicSlot) {
  return slot.bookable;
}
function OccurrenceList({
  items,
  zone,
  selection,
  select,
}: {
  items: PublicOccurrence[];
  zone: string;
  selection?: BookingSelection;
  select: (x: BookingSelection) => void;
}) {
  const rows = items.filter((x) => x.bookable);
  return rows.length ? (
    <div className="time-grid">
      {rows.map((o) => (
        <button
          className={
            selection?.mode === 'EXPLICIT_OCCURRENCES' &&
            selection.occurrence.id === o.id
              ? 'time-card selected'
              : 'time-card'
          }
          key={o.id}
          onClick={() =>
            select({
              mode: 'EXPLICIT_OCCURRENCES',
              occurrence: o,
              participantCount: 1,
            })
          }
        >
          <strong>{dateTime(o.startAt, zone)}</strong>
          <span>
            {time(o.startAt, zone)} – {time(o.endAt, zone)} ·{' '}
            {o.remainingCapacity} left
          </span>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty">No upcoming availability.</div>
  );
}
function Confirmation({
  result,
  experience,
  resource,
  zone,
}: {
  result: ReservationResult;
  experience: string;
  resource?: string;
  zone: string;
}) {
  const r = result.reservation;
  return (
    <section className="booking-card confirmation" aria-live="polite">
      <span className="confirmation-mark">✓</span>
      <p className="eyebrow">Reservation recorded</p>
      <h2>Booking confirmed</h2>
      <dl className="summary">
        <Row label="Reservation ID" value={r.id} />
        <Row label="Experience" value={experience} />
        <Row
          label="Date and time"
          value={`${dateTime(r.startAt, zone)} – ${time(r.endAt, zone)}`}
        />
        {resource && <Row label="Resource" value={resource} />}
        <Row label="Participants" value={String(r.participantCount)} />
        <Row label="Total" value={money(r.totalAmount, r.currency)} />
      </dl>
      <p>Your reservation has been recorded.</p>
    </section>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function dateTime(v: string, z: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: z,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(v));
}
function time(v: string, z: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: z,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(v));
}
function upper(v: string) {
  return v[0]!.toUpperCase() + v.slice(1);
}
function answerLabel(
  field: PublicExperience['fields'][number],
  value: AnswerValue,
) {
  if (value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  const values = Array.isArray(value) ? value : [value];
  return (
    values
      .map((key) => field.options.find((o) => o.key === key)?.label ?? key)
      .join(', ') || '—'
  );
}
