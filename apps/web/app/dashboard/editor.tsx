'use client';
import { useState, type FormEvent } from 'react';
import {
  dashboardApi,
  type Business,
  type Experience,
  type Organization,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';
export function BusinessEditor({
  business,
  role,
  onSaved,
}: {
  business: Business;
  role: Organization['role'];
  onSaved: (b: Business) => void;
}) {
  const session = useSession(),
    [editing, setEditing] = useState(false),
    [form, setForm] = useState(business),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  if (role === 'STAFF') return null;
  async function save(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError('');
    try {
      const saved = await session.authorized((t) =>
        dashboardApi.updateBusiness(t, business.id, {
          name: form.name,
          slug: form.slug,
          description: form.description,
          timezone: form.timezone,
          defaultCurrency: form.defaultCurrency,
        }),
      );
      onSaved(saved);
      setEditing(false);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not save Business.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="editor-panel">
      <div className="panel-heading">
        <h2>Business settings</h2>
        <button
          className="secondary-button"
          onClick={() => setEditing(!editing)}
        >
          {editing ? 'Cancel' : 'Edit'}
        </button>
      </div>
      {editing && (
        <form className="compact-form" onSubmit={(e) => void save(e)}>
          <Input
            label="Name"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
          />
          <Input
            label="Slug"
            value={form.slug}
            onChange={(slug) => setForm({ ...form, slug })}
          />
          <Input
            label="Timezone"
            value={form.timezone}
            onChange={(timezone) => setForm({ ...form, timezone })}
          />
          <Input
            label="Currency"
            value={form.defaultCurrency}
            onChange={(defaultCurrency) =>
              setForm({ ...form, defaultCurrency })
            }
          />
          <label>
            Description
            <textarea
              value={form.description ?? ''}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value || null })
              }
            />
          </label>
          {error && <p className="field-error">{error}</p>}
          <button disabled={pending}>
            {pending ? 'Saving…' : 'Save Business'}
          </button>
        </form>
      )}
    </section>
  );
}
export function ExperienceCreator({
  business,
  role,
  onCreated,
}: {
  business: Business;
  role: Organization['role'];
  onCreated: (x: Experience) => void;
}) {
  const session = useSession(),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({
      name: '',
      slug: '',
      description: '',
      priceAmount: '0',
      currency: business.defaultCurrency,
    }),
    [error, setError] = useState('');
  if (role === 'STAFF') return null;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const made = await session.authorized((t) =>
        dashboardApi.createExperience(t, business.id, {
          ...form,
          description: form.description || null,
        }),
      );
      onCreated({
        ...made.experience,
        draft: made.draft,
        publishedRevision: null,
      });
      setOpen(false);
      setForm({ ...form, name: '', slug: '', description: '' });
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not create Experience.');
    }
  }
  return (
    <section className="editor-panel">
      <div className="panel-heading">
        <h2>Create Experience</h2>
        <button className="secondary-button" onClick={() => setOpen(!open)}>
          {open ? 'Cancel' : 'New Experience'}
        </button>
      </div>
      {open && (
        <form className="compact-form" onSubmit={(e) => void submit(e)}>
          <Input
            label="Name"
            value={form.name}
            onChange={(name) => setForm({ ...form, name })}
          />
          <Input
            label="Slug"
            value={form.slug}
            onChange={(slug) => setForm({ ...form, slug })}
          />
          <Input
            label="Price"
            value={form.priceAmount}
            onChange={(priceAmount) => setForm({ ...form, priceAmount })}
          />
          <Input
            label="Currency"
            value={form.currency}
            onChange={(currency) => setForm({ ...form, currency })}
          />
          <label>
            Description
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          {error && <p className="field-error">{error}</p>}
          <button>Create draft</button>
        </form>
      )}
    </section>
  );
}
function Input({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
