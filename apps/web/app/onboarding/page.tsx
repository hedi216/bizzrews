'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { dashboardApi } from '../../lib/api/dashboard';
import { useSession } from '../providers';

export default function OnboardingPage() {
  const session = useSession();
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [organizationName, setOrganizationName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [currency, setCurrency] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (session.loading) return;
    if (!session.user) {
      router.replace('/login?next=/onboarding');
      return;
    }
    let active = true;
    void session
      .authorized((token) => dashboardApi.organizations(token))
      .then(({ organizations }) => {
        if (!active) return;
        if (organizations.length) router.replace('/dashboard');
        else setChecking(false);
      })
      .catch(() => active && setError('Could not check your workspace.'));
    return () => {
      active = false;
    };
  }, [router, session]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await session.authorized((token) =>
        dashboardApi.createOrganization(token, {
          organizationName,
          business: {
            name: businessName,
            slug,
            description: description.trim() || null,
            timezone,
            defaultCurrency: currency,
          },
        }),
      );
      router.replace('/dashboard');
    } catch (value) {
      setError(value instanceof Error ? value.message : 'Setup failed.');
      setPending(false);
    }
  }
  if (session.loading || checking)
    return <main className="dashboard-loading">Preparing your workspace…</main>;
  return (
    <main className="auth-main">
      <section className="auth-card onboarding-card">
        <p className="eyebrow">Business setup</p>
        <h1>Create your workspace</h1>
        <p className="muted">Set up an organization and its first business.</p>
        <form onSubmit={(event) => void submit(event)}>
          <label className="field-label" htmlFor="organization-name">
            Organization name
          </label>
          <input
            id="organization-name"
            required
            maxLength={120}
            value={organizationName}
            onChange={(e) => setOrganizationName(e.target.value)}
          />
          <label className="field-label" htmlFor="business-name">
            Business name
          </label>
          <input
            id="business-name"
            required
            maxLength={120}
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <label className="field-label" htmlFor="business-slug">
            Public slug
          </label>
          <input
            id="business-slug"
            required
            minLength={2}
            maxLength={63}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="my-business"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().trim())}
          />
          <label className="field-label" htmlFor="business-description">
            Description <span>(optional)</span>
          </label>
          <textarea
            id="business-description"
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <label className="field-label" htmlFor="business-timezone">
            IANA timezone
          </label>
          <input
            id="business-timezone"
            required
            maxLength={100}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
          <label className="field-label" htmlFor="business-currency">
            Default currency
          </label>
          <input
            id="business-currency"
            required
            maxLength={3}
            pattern="[A-Za-z]{3}"
            placeholder="EUR"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase().trim())}
          />
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          <button className="wide-button" disabled={pending}>
            {pending ? 'Creating workspace…' : 'Create workspace'}
          </button>
        </form>
      </section>
    </main>
  );
}
