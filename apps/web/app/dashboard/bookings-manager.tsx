'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  dashboardApi,
  type Occurrence,
  type Organization,
  type Reservation,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';
export function BookingsManager({
  experienceId,
  role,
  timezone,
  explicit,
}: {
  experienceId: string;
  role: Organization['role'];
  timezone: string;
  explicit: boolean;
}) {
  const s = useSession(),
    [occ, setOcc] = useState<Occurrence[]>([]),
    [res, setRes] = useState<Reservation[]>([]),
    [selected, setSelected] = useState<Reservation | null>(null),
    [error, setError] = useState(''),
    [form, setForm] = useState({ start: '', end: '', capacity: 1 });
  const write = role !== 'STAFF';
  useEffect(() => {
    let active = true;
    void Promise.all([
      s.authorized((t) => dashboardApi.occurrences(t, experienceId)),
      s.authorized((t) => dashboardApi.reservations(t, experienceId)),
    ])
      .then(([o, r]) => {
        if (active) {
          setOcc(o.occurrences);
          setRes(r.reservations);
        }
      })
      .catch(() => active && setError('Could not load bookings.'));
    return () => {
      active = false;
    };
  }, [experienceId, s]);
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const value = await s.authorized((t) =>
        dashboardApi.createOccurrence(t, experienceId, {
          startAt: new Date(form.start).toISOString(),
          endAt: new Date(form.end).toISOString(),
          timezone,
          capacity: form.capacity,
        }),
      );
      setOcc([...occ, value]);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not create occurrence.');
    }
  }
  async function cancel(r: Reservation) {
    const reason = window.prompt('Cancellation reason (optional)') ?? undefined;
    try {
      const value = await s.authorized((t) =>
        dashboardApi.cancelReservation(t, r.id, reason),
      );
      setRes(res.map((x) => (x.id === r.id ? value : x)));
      setSelected(value);
    } catch (x) {
      setError(
        x instanceof Error ? x.message : 'Could not cancel reservation.',
      );
    }
  }
  return (
    <section className="bookings-manager">
      {error && <p className="field-error">{error}</p>}
      {explicit && (
        <>
          <h3>Occurrences</h3>
          {write && (
            <form className="occurrence-form" onSubmit={(e) => void create(e)}>
              <label>
                Starts
                <input
                  type="datetime-local"
                  required
                  value={form.start}
                  onChange={(e) => setForm({ ...form, start: e.target.value })}
                />
              </label>
              <label>
                Ends
                <input
                  type="datetime-local"
                  required
                  value={form.end}
                  onChange={(e) => setForm({ ...form, end: e.target.value })}
                />
              </label>
              <label>
                Capacity
                <input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) =>
                    setForm({ ...form, capacity: Number(e.target.value) })
                  }
                />
              </label>
              <button>Create</button>
            </form>
          )}
          <div className="operations-list">
            {occ.map((o) => (
              <article key={o.id}>
                <div>
                  <strong>{new Date(o.startAt).toLocaleString()}</strong>
                  <span>
                    {o.remainingCapacity}/{o.capacity} available
                    {o.cancelledAt ? ' · cancelled' : ''}
                  </span>
                </div>
                {write && !o.cancelledAt && !o.reservedParticipants && (
                  <button
                    onClick={() =>
                      void s
                        .authorized((t) =>
                          dashboardApi.cancelOccurrence(t, o.id),
                        )
                        .then((v) =>
                          setOcc(occ.map((x) => (x.id === o.id ? v : x))),
                        )
                    }
                  >
                    Cancel
                  </button>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      <h3>Reservations</h3>
      <div className="operations-list">
        {res.map((r) => (
          <button
            className="reservation-row"
            key={r.id}
            onClick={() => setSelected(r)}
          >
            <strong>{r.customerFullName}</strong>
            <span>
              {new Date(r.startAt).toLocaleString()} · {r.status}
            </span>
          </button>
        ))}
      </div>
      {!res.length && <p className="muted">No reservations yet.</p>}
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
          {write && selected.status === 'CONFIRMED' && (
            <button
              className="danger-button"
              onClick={() => void cancel(selected)}
            >
              Cancel reservation
            </button>
          )}
        </div>
      )}
    </section>
  );
}
