'use client';
import { useState, type FormEvent } from 'react';
import {
  dashboardApi,
  fieldTypes,
  type DraftField,
  type Organization,
} from '../../lib/api/dashboard';
import { fieldTypeLabel, uniqueKey } from '../../lib/builder-utils';
import { useSession } from '../providers';

const optionTypes = ['SELECT', 'RADIO', 'MULTISELECT'];
type FieldType = (typeof fieldTypes)[number];
type PendingOption = {
  id?: string;
  key: string;
  label: string;
  position: number;
};
type FormState = {
  id?: string;
  label: string;
  key: string;
  type: FieldType;
  required: boolean;
  placeholder: string;
  helpText: string;
  minLength: string;
  maxLength: string;
  minimum: string;
  maximum: string;
  decimalPlaces: string;
  advanced: boolean;
  options: PendingOption[];
};
const blank = (): FormState => ({
  label: '',
  key: '',
  type: 'TEXT',
  required: false,
  placeholder: '',
  helpText: '',
  minLength: '',
  maxLength: '',
  minimum: '',
  maximum: '',
  decimalPlaces: '',
  advanced: false,
  options: [],
});

export function FieldEditor({
  experienceId,
  initial,
  role,
}: {
  experienceId: string;
  initial: DraftField[];
  role: Organization['role'];
}) {
  const session = useSession();
  const [fields, setFields] = useState(initial);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const writable = role !== 'STAFF';
  function edit(field: DraftField) {
    const rules = (field.validation ?? {}) as Record<string, unknown>;
    setForm({
      id: field.id,
      label: field.label,
      key: field.key,
      type: field.type as FieldType,
      required: field.required,
      placeholder: field.placeholder ?? '',
      helpText: field.helpText ?? '',
      minLength: stringValue(rules.minLength),
      maxLength: stringValue(rules.maxLength),
      minimum: stringValue(rules.minimum),
      maximum: stringValue(rules.maximum),
      decimalPlaces: stringValue(rules.decimalPlaces),
      advanced: false,
      options: field.options.map((option) => ({ ...option })),
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || saving) return;
    if (optionTypes.includes(form.type) && !form.options.length)
      return setError('Add at least one option before saving this question.');
    setSaving(true);
    setError('');
    const key = form.id
      ? form.key
      : uniqueKey(
          form.advanced && form.key ? form.key : form.label,
          fields.map((field) => field.key),
        );
    const payload = {
      key,
      label: form.label,
      type: form.type,
      required: form.required,
      placeholder: form.placeholder.trim() || null,
      helpText: form.helpText.trim() || null,
      validation: validation(form),
    };
    let created: DraftField | undefined;
    try {
      if (form.id) {
        const previous = fields.find((field) => field.id === form.id)!;
        const updated = await session.authorized((token) =>
          dashboardApi.updateField(token, experienceId, form.id!, payload),
        );
        const options = await synchronizeOptions(
          session,
          experienceId,
          updated,
          previous.options,
          form.options,
        );
        const complete = { ...updated, options };
        setFields((items) =>
          items.map((item) => (item.id === complete.id ? complete : item)),
        );
      } else {
        created = await session.authorized((token) =>
          dashboardApi.createField(token, experienceId, {
            ...payload,
            position: fields.length,
          }),
        );
        const options: DraftField['options'] = [];
        try {
          for (const option of form.options)
            options.push(
              await session.authorized((token) =>
                dashboardApi.createOption(token, experienceId, created!.id, {
                  key: option.key,
                  label: option.label,
                  position: option.position,
                }),
              ),
            );
        } catch (optionError) {
          for (const option of options)
            await session.authorized((token) =>
              dashboardApi.deleteOption(
                token,
                experienceId,
                created!.id,
                option.id,
              ),
            );
          await session.authorized((token) =>
            dashboardApi.deleteField(token, experienceId, created!.id),
          );
          throw optionError;
        }
        setFields((items) => [...items, { ...created!, options }]);
      }
      setForm(null);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : 'Could not save question.',
      );
    } finally {
      setSaving(false);
    }
  }
  async function remove(field: DraftField) {
    try {
      for (const option of field.options)
        await session.authorized((token) =>
          dashboardApi.deleteOption(token, experienceId, field.id, option.id),
        );
      await session.authorized((token) =>
        dashboardApi.deleteField(token, experienceId, field.id),
      );
      setFields((items) => items.filter((item) => item.id !== field.id));
    } catch (value) {
      setError(
        value instanceof Error ? value.message : 'Could not delete question.',
      );
    }
  }
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const previous = fields,
      next = [...fields];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const positioned = next.map((field, position) => ({ ...field, position }));
    setFields(positioned);
    try {
      await Promise.all(
        [positioned[index]!, positioned[target]!].map((field) =>
          session.authorized((token) =>
            dashboardApi.updateField(token, experienceId, field.id, {
              position: field.position,
            }),
          ),
        ),
      );
    } catch (value) {
      setFields(previous);
      setError(
        value instanceof Error ? value.message : 'Could not reorder questions.',
      );
    }
  }
  return (
    <section className="builder-panel form-builder">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Booking form</p>
          <h3>Customer information</h3>
          <p className="muted">
            BizzRes always collects these details securely.
          </p>
        </div>
        {writable && (
          <button className="secondary-button" onClick={() => setForm(blank())}>
            + Add question
          </button>
        )}
      </div>
      <div className="system-fields">
        {['Full name', 'Phone', 'Email'].map((label) => (
          <div className="locked-field" key={label}>
            <strong>{label}</strong>
            <span>Required · BizzRes</span>
          </div>
        ))}
      </div>
      {error && <p className="notice error">{error}</p>}
      {form && (
        <QuestionEditor
          form={form}
          setForm={setForm}
          save={save}
          cancel={() => setForm(null)}
          saving={saving}
        />
      )}
      <div className="question-list builder-list">
        {fields.map((field, index) => (
          <article className="question-card" key={field.id}>
            <div className="card-summary">
              <div>
                <strong>{field.label}</strong>
                <span>
                  {fieldTypeLabel[field.type] ?? field.type}
                  {field.required ? ' · Required' : ' · Optional'}
                  {field.options.length
                    ? ` · ${field.options.length} options`
                    : ''}
                </span>
              </div>
              {writable && (
                <div className="row-actions">
                  <button className="inline-action" onClick={() => edit(field)}>
                    Edit
                  </button>
                  <button
                    className="inline-action"
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    className="inline-action"
                    disabled={index === fields.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    Move down
                  </button>
                  <button
                    className="danger-link"
                    onClick={() => void remove(field)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuestionEditor({
  form,
  setForm,
  save,
  cancel,
  saving,
}: {
  form: FormState;
  setForm: (value: FormState) => void;
  save: (event: FormEvent) => void;
  cancel: () => void;
  saving: boolean;
}) {
  const choice = optionTypes.includes(form.type);
  return (
    <form className="question-editor" onSubmit={(event) => void save(event)}>
      <div className="panel-heading">
        <h4>{form.id ? 'Edit question' : 'New question'}</h4>
        <button type="button" className="text-button" onClick={cancel}>
          Cancel
        </button>
      </div>
      <label>
        Question
        <input
          required
          maxLength={200}
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
      </label>
      <label>
        Answer type
        <select
          value={form.type}
          onChange={(e) =>
            setForm({
              ...form,
              type: e.target.value as FieldType,
              options: optionTypes.includes(e.target.value) ? form.options : [],
            })
          }
        >
          {fieldTypes.map((type) => (
            <option value={type} key={type}>
              {fieldTypeLabel[type]}
            </option>
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
      <label>
        Placeholder <span>(optional)</span>
        <input
          maxLength={500}
          value={form.placeholder}
          onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
        />
      </label>
      <label className="wide">
        Help text <span>(optional)</span>
        <textarea
          maxLength={1000}
          value={form.helpText}
          onChange={(e) => setForm({ ...form, helpText: e.target.value })}
        />
      </label>
      {['TEXT', 'TEXTAREA'].includes(form.type) && (
        <>
          <label>
            Minimum characters
            <input
              type="number"
              min="0"
              value={form.minLength}
              onChange={(e) => setForm({ ...form, minLength: e.target.value })}
            />
          </label>
          <label>
            Maximum characters
            <input
              type="number"
              min="1"
              value={form.maxLength}
              onChange={(e) => setForm({ ...form, maxLength: e.target.value })}
            />
          </label>
        </>
      )}
      {form.type === 'NUMBER' && (
        <>
          <label>
            Minimum
            <input
              inputMode="decimal"
              value={form.minimum}
              onChange={(e) => setForm({ ...form, minimum: e.target.value })}
            />
          </label>
          <label>
            Maximum
            <input
              inputMode="decimal"
              value={form.maximum}
              onChange={(e) => setForm({ ...form, maximum: e.target.value })}
            />
          </label>
          <label>
            Decimal places
            <input
              type="number"
              min="0"
              max="8"
              value={form.decimalPlaces}
              onChange={(e) =>
                setForm({ ...form, decimalPlaces: e.target.value })
              }
            />
          </label>
        </>
      )}
      {choice && (
        <PendingOptions
          options={form.options}
          setOptions={(options) => setForm({ ...form, options })}
        />
      )}
      {form.type === 'CHECKBOX' && (
        <p className="wide consent-help">
          A checkbox records an explicit yes/no answer. Make it required when
          the customer must accept a condition.
        </p>
      )}
      <details className="wide" open={form.advanced}>
        <summary
          onClick={(e) => {
            e.preventDefault();
            setForm({ ...form, advanced: !form.advanced });
          }}
        >
          Advanced
        </summary>
        <label>
          Stable technical key
          <input
            pattern="[a-z][a-z0-9_]*"
            value={form.key}
            placeholder={uniqueKey(form.label, [])}
            onChange={(e) =>
              setForm({ ...form, key: e.target.value.toLowerCase() })
            }
          />
        </label>
      </details>
      {!form.id && (
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            setForm({
              ...form,
              type: 'CHECKBOX',
              options: [],
              required: true,
              label: form.label || 'I accept the conditions',
            })
          }
        >
          Use consent checkbox template
        </button>
      )}
      <button disabled={saving}>{saving ? 'Saving…' : 'Save question'}</button>
    </form>
  );
}

function PendingOptions({
  options,
  setOptions,
}: {
  options: PendingOption[];
  setOptions: (value: PendingOption[]) => void;
}) {
  const [label, setLabel] = useState('');
  function add() {
    if (!label.trim()) return;
    setOptions([
      ...options,
      {
        key: uniqueKey(
          label,
          options.map((item) => item.key),
        ),
        label: label.trim(),
        position: options.length,
      },
    ]);
    setLabel('');
  }
  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setOptions(next.map((item, position) => ({ ...item, position })));
  }
  return (
    <fieldset className="pending-options wide">
      <legend>Options</legend>
      <p className="muted">Customers will choose from these answers.</p>
      {options.map((option, index) => (
        <div className="option-row" key={option.id ?? `${option.key}-${index}`}>
          <input
            aria-label={`Option ${index + 1}`}
            required
            value={option.label}
            onChange={(e) =>
              setOptions(
                options.map((item, position) =>
                  position === index
                    ? { ...item, label: e.target.value }
                    : item,
                ),
              )
            }
          />
          <button
            type="button"
            disabled={index === 0}
            onClick={() => move(index, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index === options.length - 1}
            onClick={() => move(index, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="danger-link"
            onClick={() =>
              setOptions(
                options
                  .filter((_, position) => position !== index)
                  .map((item, position) => ({ ...item, position })),
              )
            }
          >
            Remove
          </button>
          <details>
            <summary>Advanced</summary>
            <label>
              Stable option key
              <input
                pattern="[a-z][a-z0-9_]*"
                value={option.key}
                onChange={(e) =>
                  setOptions(
                    options.map((item, position) =>
                      position === index
                        ? { ...item, key: e.target.value.toLowerCase() }
                        : item,
                    ),
                  )
                }
              />
            </label>
          </details>
        </div>
      ))}
      <div className="inline-form">
        <input
          aria-label="New option label"
          placeholder="Example: Beginner"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add}>
          + Add option
        </button>
      </div>
      {!options.length && (
        <p className="field-error">Add at least one option.</p>
      )}
    </fieldset>
  );
}

async function synchronizeOptions(
  session: ReturnType<typeof useSession>,
  experienceId: string,
  field: DraftField,
  previous: DraftField['options'],
  desired: PendingOption[],
) {
  for (const option of previous.filter(
    (option) => !desired.some((item) => item.id === option.id),
  ))
    await session.authorized((token) =>
      dashboardApi.deleteOption(token, experienceId, field.id, option.id),
    );
  const result: DraftField['options'] = [];
  for (const option of desired)
    result.push(
      option.id
        ? await session.authorized((token) =>
            dashboardApi.updateOption(
              token,
              experienceId,
              field.id,
              option.id!,
              {
                key: option.key,
                label: option.label,
                position: option.position,
              },
            ),
          )
        : await session.authorized((token) =>
            dashboardApi.createOption(token, experienceId, field.id, {
              key: option.key,
              label: option.label,
              position: option.position,
            }),
          ),
    );
  return result;
}
function validation(form: FormState) {
  if (['TEXT', 'TEXTAREA'].includes(form.type)) {
    const value: Record<string, number> = {};
    if (form.minLength !== '') value.minLength = Number(form.minLength);
    if (form.maxLength !== '') value.maxLength = Number(form.maxLength);
    return value;
  }
  if (form.type === 'NUMBER') {
    const value: Record<string, string | number> = {};
    if (form.minimum !== '') value.minimum = form.minimum;
    if (form.maximum !== '') value.maximum = form.maximum;
    if (form.decimalPlaces !== '')
      value.decimalPlaces = Number(form.decimalPlaces);
    return value;
  }
  return {};
}
function stringValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value);
}
