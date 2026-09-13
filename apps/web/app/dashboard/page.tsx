'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  dashboardApi,
  type Experience,
  type Organization,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';
import { BusinessEditor, ExperienceCreator } from './editor';
import { ExperienceEditor } from './experience-editor';
import { ResourceManager } from './resource-manager';
export default function DashboardPage() {
  const router = useRouter(),
    session = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]),
    [organizationId, setOrganizationId] = useState(''),
    [businessId, setBusinessId] = useState(''),
    [experiences, setExperiences] = useState<Experience[]>([]),
    [selected, setSelected] = useState<Experience | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!session.loading && !session.user) router.replace('/login');
  }, [router, session.loading, session.user]);
  useEffect(() => {
    if (!session.user) return;
    let active = true;
    void session
      .authorized((t) => dashboardApi.organizations(t))
      .then((r) => {
        if (active) {
          if (!r.organizations.length) {
            router.replace('/onboarding');
            return;
          }
          setOrganizations(r.organizations);
          setOrganizationId(r.organizations[0]?.id ?? '');
          setBusinessId(r.organizations[0]?.businesses[0]?.id ?? '');
        }
      })
      .catch(() => active && setError('Could not load your workspace.'));
    return () => {
      active = false;
    };
  }, [router, session]);
  useEffect(() => {
    if (!businessId) return;
    let active = true;
    void session
      .authorized((t) => dashboardApi.experiences(t, businessId))
      .then((r) => active && setExperiences(r.experiences))
      .catch(() => active && setError('Could not load Experiences.'));
    return () => {
      active = false;
    };
  }, [businessId, session]);
  if (session.loading || (!session.user && !error))
    return <main className="dashboard-loading">Loading workspace…</main>;
  const organization = organizations.find((o) => o.id === organizationId),
    business = organization?.businesses.find((b) => b.id === businessId);
  return (
    <main className="dashboard">
      <header className="dashboard-header">
        <div>
          <span className="brand-mark">B</span>
          <strong>BizzRes</strong>
        </div>
        <div>
          <span>{session.user?.displayName ?? session.user?.email}</span>
          <button
            className="text-button"
            onClick={() =>
              void session.logout().then(() => router.replace('/login'))
            }
          >
            Sign out
          </button>
        </div>
      </header>
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <label>
            Organization
            <select
              value={organizationId}
              onChange={(e) => {
                setOrganizationId(e.target.value);
                const o = organizations.find((x) => x.id === e.target.value);
                setBusinessId(o?.businesses[0]?.id ?? '');
              }}
            >
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Business
            <select
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
            >
              {organization?.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          {organization && (
            <span className="role-badge">{organization.role}</span>
          )}
        </aside>
        <section className="dashboard-content">
          {error && <div className="notice error">{error}</div>}
          <p className="eyebrow">{business?.name ?? 'Workspace'}</p>
          <h1>Experiences</h1>
          <p className="muted">Manage what customers can book.</p>
          {business && organization && (
            <div className="editor-grid">
              <BusinessEditor
                business={business}
                role={organization.role}
                onSaved={(saved) =>
                  setOrganizations((items) =>
                    items.map((o) =>
                      o.id === organization.id
                        ? {
                            ...o,
                            businesses: o.businesses.map((b) =>
                              b.id === saved.id ? saved : b,
                            ),
                          }
                        : o,
                    ),
                  )
                }
              />
              <ExperienceCreator
                business={business}
                role={organization.role}
                onCreated={(made) =>
                  setExperiences((items) => [...items, made])
                }
              />
            </div>
          )}
          {experiences.length ? (
            <div className="management-list">
              {experiences.map((x) => (
                <article key={x.id}>
                  <div>
                    <h2>
                      {x.draft?.name ?? x.publishedRevision?.name ?? x.slug}
                    </h2>
                    <p>/{x.slug}</p>
                    <button
                      className="inline-action"
                      onClick={() => setSelected(x)}
                    >
                      Manage
                    </button>
                  </div>
                  <div className="status-stack">
                    <span>
                      {x.acceptingReservations
                        ? 'Reservations open'
                        : 'Reservations closed'}
                    </span>
                    <span>
                      {x.draft
                        ? `Draft v${x.draft.version}`
                        : x.publishedRevision
                          ? `Published v${x.publishedRevision.version}`
                          : 'Unpublished'}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty dashboard-empty">
              <h2>No Experiences yet</h2>
              <p>Create your first Experience to start accepting bookings.</p>
            </div>
          )}
          {selected && organization && (
            <ExperienceEditor
              experience={selected}
              role={organization.role}
              onClose={() => setSelected(null)}
              onChanged={(changed) => {
                setSelected(changed);
                setExperiences((items) =>
                  items.map((x) => (x.id === changed.id ? changed : x)),
                );
              }}
              timezone={business?.timezone ?? 'UTC'}
              businessId={businessId}
            />
          )}
          {business && organization && (
            <ResourceManager
              key={business.id}
              business={business}
              role={organization.role}
            />
          )}
        </section>
      </div>
    </main>
  );
}
