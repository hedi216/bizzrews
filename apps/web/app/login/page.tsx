'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import Link from 'next/link';
import { useSession } from '../providers';
import { safeNext } from '../../lib/safe-next';
function LoginForm() {
  const router = useRouter(),
    session = useSession(),
    searchParams = useSearchParams(),
    next = safeNext(searchParams.get('next'), '/dashboard');
  const accountIntent = next === '/account';
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  useEffect(() => {
    if (!session.loading && session.user) router.replace(next);
  }, [next, router, session.loading, session.user]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await session.login(email, password);
      router.replace(next);
    } catch {
      setError('Email or password is incorrect.');
      setPending(false);
    }
  }
  return (
    <main className="auth-main">
      <section className="auth-card">
        <Link className="brand dashboard-brand" href="/">
          <span className="brand-mark">B</span>
          <span>BizzRes</span>
        </Link>
        <p className="eyebrow">Business workspace</p>
        <h1>Welcome back</h1>
        <p className="muted">
          Sign in to manage your businesses and reservations.
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <div className="field">
            <label className="field-label" htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="wide-button" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="auth-alternative">
          New to BizzRes?{' '}
          <Link
            href={
              accountIntent
                ? '/register?next=/account'
                : '/register?next=/onboarding'
            }
          >
            {accountIntent ? 'Create an account' : 'Create a business account'}
          </Link>
        </p>
      </section>
    </main>
  );
}
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="dashboard-loading">Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
