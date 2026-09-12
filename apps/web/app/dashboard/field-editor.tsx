'use client';
import { useState, type FormEvent } from 'react';
import {
  dashboardApi,
  fieldTypes,
  type DraftField,
  type Organization,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';
const optionTypes = ['SELECT', 'RADIO', 'MULTISELECT'];
export function FieldEditor({
  experienceId,
  initial,
  role,
}: {
  experienceId: string;
  initial: DraftField[];
  role: Organization['role'];
}) {
  const session = useSession(),
    [fields, setFields] = useState(initial),
    [open, setOpen] = useState(false),
    [error, setError] = useState(''),
    [form, setForm] = useState({
      key: '',
      label: '',
      type: 'TEXT' as (typeof fieldTypes)[number],
      required: false,
    });
  const writable = role !== 'STAFF';
  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const value = await session.authorized((t) =>
        dashboardApi.createField(t, experienceId, {
          ...form,
          position: fields.length,
        }),
      );
      setFields([...fields, { ...value, options: value.options ?? [] }]);
      setOpen(false);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not add question.');
    }
  }
  async function remove(f: DraftField) {
    try {
      for (const o of f.options)
        await session.authorized((t) =>
          dashboardApi.deleteOption(t, experienceId, f.id, o.id),
        );
      await session.authorized((t) =>
        dashboardApi.deleteField(t, experienceId, f.id),
      );
      setFields(fields.filter((x) => x.id !== f.id));
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not delete question.');
    }
  }
  async function edit(f: DraftField) {
    const label = window.prompt('Question label', f.label);
    if (!label?.trim()) return;
    try {
      const updated = await session.authorized((t) =>
        dashboardApi.updateField(t, experienceId, f.id, {
          label,
          required: !f.required,
        }),
      );
      setFields(fields.map((x) => (x.id === f.id ? { ...x, ...updated } : x)));
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Could not update question.');
    }
  }
  return (
    <section className="field-editor">
      <div className="panel-heading">
        <div>
          <h3>Custom questions</h3>
          <p className="muted">Questions shown during booking.</p>
        </div>
        {writable && (
          <button className="secondary-button" onClick={() => setOpen(!open)}>
            {open ? 'Cancel' : 'Add question'}
          </button>
        )}
      </div>
      {error && <p className="field-error">{error}</p>}
      {open && (
        <form className="field-create" onSubmit={(e) => void create(e)}>
          <label>
            Key
            <input
              required
              pattern="[a-z][a-z0-9_]*"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
          </label>
          <label>
            Label
            <input
              required
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </label>
          <label>
            Type
            <select
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as typeof form.type })
              }
            >
              {fieldTypes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="choice">
            <input
              type="checkbox"
              checked={form.required}
              onChange={(e) => setForm({ ...form, required: e.target.checked })}
            />
            Required
          </label>
          <button>Add</button>
        </form>
      )}
      <div className="question-list">
        {fields.map((f) => (
          <article key={f.id}>
            <div>
              <strong>{f.label}</strong>
              <span>
                {f.key} · {f.type}
                {f.required ? ' · required' : ''}
              </span>
            </div>
            {optionTypes.includes(f.type) && (
              <Options
                experienceId={experienceId}
                field={f}
                fields={fields}
                setFields={setFields}
                writable={writable}
              />
            )}{' '}
            {writable && (
              <div className="row-actions">
                <button className="inline-action" onClick={() => void edit(f)}>
                  Edit label / required
                </button>
                <button className="danger-link" onClick={() => void remove(f)}>
                  Delete
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
function Options({
  experienceId,
  field,
  fields,
  setFields,
  writable,
}: {
  experienceId: string;
  field: DraftField;
  fields: DraftField[];
  setFields: (v: DraftField[]) => void;
  writable: boolean;
}) {
  const session = useSession(),
    [key, setKey] = useState(''),
    [label, setLabel] = useState('');
  async function add(e: FormEvent) {
    e.preventDefault();
    const o = await session.authorized((t) =>
      dashboardApi.createOption(t, experienceId, field.id, {
        key,
        label,
        position: field.options.length,
      }),
    );
    setFields(
      fields.map((x) =>
        x.id === field.id ? { ...x, options: [...x.options, o] } : x,
      ),
    );
    setKey('');
    setLabel('');
  }
  async function remove(id: string) {
    await session.authorized((t) =>
      dashboardApi.deleteOption(t, experienceId, field.id, id),
    );
    setFields(
      fields.map((x) =>
        x.id === field.id
          ? { ...x, options: x.options.filter((o) => o.id !== id) }
          : x,
      ),
    );
  }
  async function edit(option: DraftField['options'][number]) {
    const label = window.prompt('Option label', option.label);
    if (!label?.trim()) return;
    const updated = await session.authorized((t) =>
      dashboardApi.updateOption(t, experienceId, field.id, option.id, {
        label,
      }),
    );
    setFields(
      fields.map((x) =>
        x.id === field.id
          ? {
              ...x,
              options: x.options.map((o) => (o.id === option.id ? updated : o)),
            }
          : x,
      ),
    );
  }
  return (
    <div className="option-editor">
      {field.options.map((o) => (
        <span key={o.id}>
          {o.label}
          {writable && (
            <button aria-label={`Edit ${o.label}`} onClick={() => void edit(o)}>
              Edit
            </button>
          )}
          {writable && (
            <button
              aria-label={`Delete ${o.label}`}
              onClick={() => void remove(o.id)}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {writable && (
        <form onSubmit={(e) => void add(e)}>
          <input
            aria-label="Option key"
            placeholder="key"
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <input
            aria-label="Option label"
            placeholder="Label"
            required
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button>Add option</button>
        </form>
      )}
    </div>
  );
}
