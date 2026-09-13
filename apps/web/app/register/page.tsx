'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { safeNext } from '../../lib/safe-next';
import { useSession } from '../providers';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const next = safeNext(searchParams.get('next'), '/account');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!session.loading && session.user) router.replace(next);
  }, [next, router, session.loading, session.user]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await session.register(email, password, displayName);
      router.replace(next);
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Registration failed.');
      setPending(false);
    }
  }
  return (
    <main className="auth-main">
      <section className="auth-card">
        <Link className="brand dashboard-brand" href="/">
          BizzRes
        </Link>
        <p className="eyebrow">Create your account</p>
        <h1>Start with BizzRes</h1>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field-label" htmlFor="register-name">
            Display name <span>(optional)</span>
          </label>
          <input
            id="register-name"
            maxLength={120}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <label className="field-label" htmlFor="register-email">
            Email
          </label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label className="field-label" htmlFor="register-password">
            Password
          </label>
          <input
            id="register-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="muted">Use 12–128 characters.</p>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="wide-button" disabled={pending}>
            {pending ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="auth-alternative">
          Already registered?{' '}
          <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        </p>
      </section>
    </main>
  );
}
export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="dashboard-loading">Loading…</main>}>
      <RegisterForm />
    </Suspense>
  );
}
