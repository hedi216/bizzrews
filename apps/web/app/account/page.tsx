'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  dashboardApi,
  type CustomerReservation,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';

export default function AccountPage() {
  const session = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<CustomerReservation[]>([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!session.loading && !session.user) router.replace('/login');
  }, [router, session.loading, session.user]);
  useEffect(() => {
    if (!session.user) return;
    void session
      .authorized((token) => dashboardApi.customerReservations(token))
      .then((result) => setRows(result.reservations))
      .catch(() => setMessage('Could not load your reservations.'));
  }, [session]);
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await session.authorized((token) =>
        dashboardApi.updateCustomerProfile(token, name.trim() || null),
      );
      setMessage('Profile saved.');
    } catch {
      setMessage('Could not save your profile.');
    }
  }
  if (session.loading)
    return <main className="dashboard-loading">Loading…</main>;
  return (
    <main className="account-page">
      <header className="account-header">
        <strong>BizzRes</strong>
        <button
          onClick={() =>
            void session.logout().then(() => router.push('/login'))
          }
        >
          Sign out
        </button>
      </header>
      <section className="account-card">
        <p className="eyebrow">Your account</p>
        <h1>Profile</h1>
        <form onSubmit={(event) => void save(event)}>
          <label className="field-label" htmlFor="displayName">
            Display name
          </label>
          <input
            id="displayName"
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit">Save profile</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </section>
      <section className="account-card">
        <p className="eyebrow">Bookings</p>
        <h2>Your reservations</h2>
        {rows.length ? (
          rows.map((row) => (
            <article className="account-reservation" key={row.id}>
              <strong>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                  timeZone: row.timezone,
                }).format(new Date(row.startAt))}
              </strong>
              <span>
                {row.status} · {row.participantCount} participant
                {row.participantCount === 1 ? '' : 's'}
              </span>
              <span>
                {row.totalAmount} {row.currency}
              </span>
            </article>
          ))
        ) : (
          <p>
            No account-linked reservations yet. Guest bookings remain separate.
          </p>
        )}
      </section>
    </main>
  );
}
