'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  dashboardApi,
  type CustomerReservation,
  type CustomerLoyaltyAccount,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';

export default function AccountPage() {
  const session = useSession();
  const router = useRouter();
  const [rows, setRows] = useState<CustomerReservation[]>([]);
  const [loyalty, setLoyalty] = useState<CustomerLoyaltyAccount[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!session.loading && !session.user)
      router.replace('/login?next=/account');
  }, [router, session.loading, session.user]);
  useEffect(() => {
    if (!session.user) return;
    void session
      .authorized((token) => dashboardApi.customerReservations(token))
      .then((result) => setRows(result.reservations))
      .catch(() => setMessage('Could not load your reservations.'));
    void session
      .authorized((token) => dashboardApi.customerLoyalty(token))
      .then((result) => setLoyalty(result.accounts))
      .catch(() => setMessage('Could not load your loyalty balance.'));
  }, [session]);
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await session.authorized((token) =>
        dashboardApi.updateCustomerProfile(
          token,
          (name ?? session.user?.displayName ?? '').trim() || null,
        ),
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
            value={name ?? session.user?.displayName ?? ''}
            onChange={(event) => setName(event.target.value)}
          />
          <button type="submit">Save profile</button>
        </form>
        {message && <p className="notice">{message}</p>}
      </section>
      <section className="account-card">
        <p className="eyebrow">Loyalty</p>
        <h2>Your points</h2>
        {loyalty.length ? (
          loyalty.map((account) => (
            <article className="account-reservation" key={account.id}>
              <strong>{account.business.name}</strong>
              <span>{account.balance} points</span>
              {account.transactions.map((entry) => (
                <small key={entry.id}>
                  {entry.pointsDelta > 0 ? '+' : ''}
                  {entry.pointsDelta} ·{' '}
                  {entry.description ?? entry.type.toLowerCase()}
                </small>
              ))}
            </article>
          ))
        ) : (
          <p>No loyalty points yet.</p>
        )}
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
