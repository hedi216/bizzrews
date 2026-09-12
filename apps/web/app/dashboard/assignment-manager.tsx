'use client';
import { useEffect, useState } from 'react';
import {
  dashboardApi,
  type Organization,
  type Resource,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';
export function AssignmentManager({
  businessId,
  experienceId,
  role,
}: {
  businessId: string;
  experienceId: string;
  role: Organization['role'];
}) {
  const s = useSession(),
    [all, setAll] = useState<Resource[]>([]),
    [assigned, setAssigned] = useState(new Set<string>()),
    [error, setError] = useState('');
  const write = role !== 'STAFF';
  useEffect(() => {
    let active = true;
    void Promise.all([
      s.authorized((t) => dashboardApi.resources(t, businessId)),
      s.authorized((t) => dashboardApi.assignments(t, experienceId)),
    ])
      .then(([a, b]) => {
        if (active) {
          setAll(a.resources);
          setAssigned(
            new Set(
              b.resources.filter((x) => x.assignmentActive).map((x) => x.id),
            ),
          );
        }
      })
      .catch(() => active && setError('Could not load Resource assignments.'));
    return () => {
      active = false;
    };
  }, [businessId, experienceId, s]);
  async function toggle(id: string, on: boolean) {
    try {
      if (on)
        await s.authorized((t) =>
          dashboardApi.assignResource(t, experienceId, id),
        );
      else
        await s.authorized((t) =>
          dashboardApi.unassignResource(t, experienceId, id),
        );
      setAssigned((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
    } catch (x) {
      setError(
        x instanceof Error
          ? x.message
          : 'Could not update Resource assignment.',
      );
    }
  }
  return (
    <section className="assignment-manager">
      <h3>Assigned Resources</h3>
      <p className="muted">
        Generated availability uses active Resources assigned here.
      </p>
      {error && <p className="field-error">{error}</p>}
      <div>
        {all
          .filter((x) => x.active)
          .map((r) => (
            <label className="choice" key={r.id}>
              <input
                type="checkbox"
                disabled={!write}
                checked={assigned.has(r.id)}
                onChange={(e) => void toggle(r.id, e.target.checked)}
              />
              <span>{r.name}</span>
            </label>
          ))}
      </div>
      {!all.length && <p className="muted">Create a Resource below first.</p>}
    </section>
  );
}
