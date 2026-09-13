'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  dashboardApi,
  type Occurrence,
  type Organization,
  type Reservation,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';

type ExplicitKind = 'ONE_EVENT' | 'SEVERAL_SESSIONS';
type EventForm = {
  id?: string;
  date: string;
  start: string;
  end: string;
  capacity: number;
  bookingClosesAt: string;
};
const empty = (): EventForm => ({
  date: '',
  start: '',
  end: '',
  capacity: 1,
  bookingClosesAt: '',
});

export function BookingsManager({
  experienceId,
  role,
  timezone,
  explicit,
  explicitKind = 'ONE_EVENT',
  onSeveralSessionsDetected,
}: {
  experienceId: string;
  role: Organization['role'];
  timezone: string;
  explicit: boolean;
  explicitKind?: ExplicitKind;
  onSeveralSessionsDetected?: () => void;
}) {
  const session = useSession();
  const [occurrences, setOccurrences] = useState<Occurrence[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<EventForm>(empty());
  const writable = role !== 'STAFF';
  const active = occurrences.filter((item) => !item.cancelledAt);

  useEffect(() => {
    let mounted = true;
    void Promise.all([
      session.authorized((token) =>
        dashboardApi.occurrences(token, experienceId),
      ),
      session.authorized((token) =>
        dashboardApi.reservations(token, experienceId),
      ),
    ])
      .then(([occurrenceResult, reservationResult]) => {
        if (!mounted) return;
        setOccurrences(occurrenceResult.occurrences);
        if (
          explicit &&
          occurrenceResult.occurrences.filter((item) => !item.cancelledAt)
            .length > 1
        )
          onSeveralSessionsDetected?.();
        if (explicit && explicitKind === 'ONE_EVENT') {
          const current = occurrenceResult.occurrences.find(
            (item) => !item.cancelledAt,
          );
          setForm(current ? toForm(current) : empty());
        }
        setReservations(reservationResult.reservations);
      })
      .catch(() => mounted && setError('Could not load bookings.'));
    return () => {
      mounted = false;
    };
  }, [
    experienceId,
    explicit,
    explicitKind,
    onSeveralSessionsDetected,
    session,
  ]);

  async function saveEvent(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const body = {
        startAt: new Date(`${form.date}T${form.start}`).toISOString(),
        endAt: new Date(`${form.date}T${form.end}`).toISOString(),
        timezone,
        capacity: form.capacity,
        bookingClosesAt: form.bookingClosesAt
          ? new Date(form.bookingClosesAt).toISOString()
          : null,
      };
      const value = form.id
        ? await session.authorized((token) =>
            dashboardApi.updateOccurrence(token, form.id!, body),
          )
        : await session.authorized((token) =>
            dashboardApi.createOccurrence(token, experienceId, body),
          );
      setOccurrences((items) =>
        form.id
          ? items.map((item) => (item.id === value.id ? value : item))
          : [...items, value],
      );
      setForm(explicitKind === 'ONE_EVENT' ? toForm(value) : empty());
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'Could not save this event. Events with confirmed reservations cannot be structurally changed.',
      );
    }
  }

  async function cancelOccurrence(item: Occurrence) {
    try {
      const value = await session.authorized((token) =>
        dashboardApi.cancelOccurrence(token, item.id),
      );
      setOccurrences((items) =>
        items.map((current) => (current.id === value.id ? value : current)),
      );
      if (form.id === value.id) setForm(empty());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not cancel this session.',
      );
    }
  }

  async function cancelReservation(reservation: Reservation) {
    const reason = window.prompt('Cancellation reason (optional)') ?? undefined;
    try {
      const value = await session.authorized((token) =>
        dashboardApi.cancelReservation(token, reservation.id, reason),
      );
      setReservations((items) =>
        items.map((item) => (item.id === value.id ? value : item)),
      );
      setSelected(value);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not cancel reservation.',
      );
    }
  }

  return (
    <section className="bookings-manager">
      {error && <p className="notice error">{error}</p>}
      {explicit && (
        <section className="event-sessions">
          <div className="panel-heading">
            <div>
              <h3>
                {explicitKind === 'ONE_EVENT'
                  ? 'Your fixed event'
                  : 'Dates and sessions'}
              </h3>
              <p className="muted">
                {explicitKind === 'ONE_EVENT'
                  ? 'Customers will see this date automatically without choosing a time.'
                  : 'Customers choose one of these sessions before booking.'}
              </p>
            </div>
            {writable && explicitKind === 'SEVERAL_SESSIONS' && (
              <button
                className="secondary-button"
                onClick={() => setForm(empty())}
              >
                + Add another session
              </button>
            )}
          </div>
          {writable &&
            (explicitKind === 'ONE_EVENT' ||
              !form.id ||
              explicitKind === 'SEVERAL_SESSIONS') && (
              <EventEditor
                form={form}
                setForm={setForm}
                submit={saveEvent}
                label={
                  form.id
                    ? 'Save changes'
                    : explicitKind === 'ONE_EVENT'
                      ? 'Save event'
                      : 'Add session'
                }
              />
            )}
          {explicitKind === 'SEVERAL_SESSIONS' && (
            <div className="session-list">
              {occurrences.map((item) => (
                <article className="session-card" key={item.id}>
                  <div>
                    <strong>{formatDate(item.startAt, timezone)}</strong>
                    <span>
                      {formatTime(item.startAt, timezone)} –{' '}
                      {formatTime(item.endAt, timezone)}
                    </span>
                    <span>
                      Capacity {item.capacity} · {item.remainingCapacity}{' '}
                      remaining{item.cancelledAt ? ' · Cancelled' : ''}
                    </span>
                  </div>
                  {writable && !item.cancelledAt && (
                    <div className="row-actions">
                      <button onClick={() => setForm(toForm(item))}>
                        Edit
                      </button>
                      {!item.reservedParticipants && (
                        <button
                          className="danger-link"
                          onClick={() => void cancelOccurrence(item)}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
          {explicitKind === 'ONE_EVENT' && active[0] && (
            <p className="success-text">
              One event configured. The public booking page will select it
              automatically.
            </p>
          )}
        </section>
      )}
      <h3>Reservations</h3>
      <div className="operations-list">
        {reservations.map((reservation) => (
          <button
            className="reservation-row"
            key={reservation.id}
            onClick={() => setSelected(reservation)}
          >
            <strong>{reservation.customerFullName}</strong>
            <span>
              {new Date(reservation.startAt).toLocaleString()} ·{' '}
              {reservation.status}
            </span>
          </button>
        ))}
      </div>
      {!reservations.length && <p className="muted">No reservations yet.</p>}
      {selected && (
        <div className="reservation-detail">
          <button
            className="secondary-button"
            onClick={() => setSelected(null)}
          >
            Close
          </button>
          <dl>
            <dt>Name</dt>
            <dd>{selected.customerFullName}</dd>
            <dt>Phone</dt>
            <dd>{selected.customerPhone}</dd>
            <dt>Email</dt>
            <dd>{selected.customerEmail}</dd>
            <dt>Participants</dt>
            <dd>{selected.participantCount}</dd>
            <dt>Total</dt>
            <dd>
              {selected.totalAmount} {selected.currency}
            </dd>
          </dl>
          {writable && selected.status === 'CONFIRMED' && (
            <button
              className="danger-button"
              onClick={() => void cancelReservation(selected)}
            >
              Cancel reservation
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function EventEditor({
  form,
  setForm,
  submit,
  label,
}: {
  form: EventForm;
  setForm: (value: EventForm) => void;
  submit: (event: FormEvent) => void;
  label: string;
}) {
  return (
    <form className="event-form" onSubmit={(event) => void submit(event)}>
      <label>
        Date
        <input
          type="date"
          required
          value={form.date}
          onChange={(event) => setForm({ ...form, date: event.target.value })}
        />
      </label>
      <label>
        Starts
        <input
          type="time"
          required
          value={form.start}
          onChange={(event) => setForm({ ...form, start: event.target.value })}
        />
      </label>
      <label>
        Ends
        <input
          type="time"
          required
          value={form.end}
          onChange={(event) => setForm({ ...form, end: event.target.value })}
        />
      </label>
      <label>
        Capacity
        <input
          type="number"
          min="1"
          required
          value={form.capacity}
          onChange={(event) =>
            setForm({ ...form, capacity: Number(event.target.value) })
          }
        />
      </label>
      <label>
        Booking closes <span>(optional)</span>
        <input
          type="datetime-local"
          value={form.bookingClosesAt}
          onChange={(event) =>
            setForm({ ...form, bookingClosesAt: event.target.value })
          }
        />
      </label>
      <button>{label}</button>
    </form>
  );
}
function toForm(item: Occurrence): EventForm {
  const start = localParts(item.startAt),
    end = localParts(item.endAt);
  return {
    id: item.id,
    date: start.date,
    start: start.time,
    end: end.time,
    capacity: item.capacity,
    bookingClosesAt: item.bookingClosesAt
      ? localDateTime(item.bookingClosesAt)
      : '',
  };
}
function localParts(value: string) {
  const date = new Date(value);
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}
function localDateTime(value: string) {
  const part = localParts(value);
  return `${part.date}T${part.time}`;
}
const pad = (value: number) => String(value).padStart(2, '0');
const formatDate = (value: string, zone: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    dateStyle: 'full',
  }).format(new Date(value));
const formatTime = (value: string, zone: string) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
