'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  dashboardApi,
  type Business,
  type Organization,
  type Resource,
  type WeeklyWindow,
  type AvailabilityOverride,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';
const days = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;
export function ResourceManager({
  business,
  role,
}: {
  business: Business;
  role: Organization['role'];
}) {
  const session = useSession(),
    [resources, setResources] = useState<Resource[]>([]),
    [name, setName] = useState(''),
    [selected, setSelected] = useState<Resource | null>(null),
    [error, setError] = useState('');
  const writable = role !== 'STAFF';
  useEffect(() => {
    let active = true;
    void session
      .authorized((t) => dashboardApi.resources(t, business.id))
      .then((r) => active && setResources(r.resources))
      .catch(() => active && setError('Could not load Resources.'));
    return () => {
      active = false;
    };
  }, [business.id, session]);
  async function create(e: FormEvent) {
    e.preventDefault();
    try {
      const r = await session.authorized((t) =>
        dashboardApi.createResource(t, business.id, name),
      );
      setResources([...resources, r]);
      setName('');
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not create Resource.');
    }
  }
  return (
    <section className="resource-panel">
      <div className="panel-heading">
        <div>
          <h2>Resources</h2>
          <p className="muted">
            Staff, rooms, or equipment used for appointments.
          </p>
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      {writable && (
        <form className="inline-form" onSubmit={(e) => void create(e)}>
          <input
            required
            placeholder="Resource name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button>Add Resource</button>
        </form>
      )}
      <div className="resource-list">
        {resources.map((r) => (
          <button
            className={selected?.id === r.id ? 'selected' : ''}
            key={r.id}
            onClick={() => setSelected(r)}
          >
            <strong>{r.name}</strong>
            <span>{r.active ? 'Active' : 'Inactive'}</span>
          </button>
        ))}
      </div>
      {selected && (
        <AvailabilityEditor resource={selected} writable={writable} />
      )}
    </section>
  );
}
function AvailabilityEditor({
  resource,
  writable,
}: {
  resource: Resource;
  writable: boolean;
}) {
  const session = useSession(),
    [windows, setWindows] = useState<WeeklyWindow[]>([]),
    [overrides, setOverrides] = useState<AvailabilityOverride[]>([]),
    [draft, setDraft] = useState({
      dayOfWeek: 'MONDAY' as WeeklyWindow['dayOfWeek'],
      start: '09:00',
      end: '17:00',
    }),
    [exception, setException] = useState({
      date: '',
      available: false,
      start: '09:00',
      end: '17:00',
    }),
    [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void Promise.all([
      session.authorized((t) => dashboardApi.weekly(t, resource.id)),
      session.authorized((t) => dashboardApi.overrides(t, resource.id)),
    ]).then(([w, o]) => {
      if (active) {
        setWindows(w.windows);
        setOverrides(o.overrides);
      }
    });
    return () => {
      active = false;
    };
  }, [resource.id, session]);
  async function saveWeekly() {
    const result = await session.authorized((t) =>
      dashboardApi.replaceWeekly(t, resource.id, windows),
    );
    setWindows(result.windows);
    setMessage('Weekly availability saved.');
  }
  async function saveOverride(e: FormEvent) {
    e.preventDefault();
    const value = await session.authorized((t) =>
      dashboardApi.putOverride(
        t,
        resource.id,
        exception.date,
        exception.available
          ? { available: true, start: exception.start, end: exception.end }
          : { available: false },
      ),
    );
    setOverrides(
      [...overrides.filter((x) => x.date !== value.date), value].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
    );
    setMessage('Date override saved.');
  }
  return (
    <div className="availability-editor">
      <h3>{resource.name} availability</h3>
      {message && <p className="success-text">{message}</p>}
      <div className="window-list">
        {windows.map((w, i) => (
          <span key={`${w.dayOfWeek}-${w.start}-${i}`}>
            {w.dayOfWeek.slice(0, 3)} {w.start}–{w.end}
            {writable && (
              <button
                onClick={() => setWindows(windows.filter((_, n) => n !== i))}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {writable && (
        <>
          <div className="inline-form window-form">
            <select
              value={draft.dayOfWeek}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  dayOfWeek: e.target.value as WeeklyWindow['dayOfWeek'],
                })
              }
            >
              {days.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <input
              type="time"
              value={draft.start}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
            <input
              type="time"
              value={draft.end}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
            <button onClick={() => setWindows([...windows, draft])}>
              Add window
            </button>
            <button onClick={() => void saveWeekly()}>Save week</button>
          </div>
          <form
            className="override-form"
            onSubmit={(e) => void saveOverride(e)}
          >
            <h4>Date override</h4>
            <input
              type="date"
              required
              value={exception.date}
              onChange={(e) =>
                setException({ ...exception, date: e.target.value })
              }
            />
            <label className="choice">
              <input
                type="checkbox"
                checked={exception.available}
                onChange={(e) =>
                  setException({ ...exception, available: e.target.checked })
                }
              />
              Available
            </label>
            {exception.available && (
              <>
                <input
                  type="time"
                  value={exception.start}
                  onChange={(e) =>
                    setException({ ...exception, start: e.target.value })
                  }
                />
                <input
                  type="time"
                  value={exception.end}
                  onChange={(e) =>
                    setException({ ...exception, end: e.target.value })
                  }
                />
              </>
            )}
            <button>Save override</button>
          </form>
        </>
      )}
      <div className="override-list">
        {overrides.map((o) => (
          <span key={o.id}>
            {o.date}: {o.available ? `${o.start}–${o.end}` : 'Unavailable'}
          </span>
        ))}
      </div>
    </div>
  );
}
