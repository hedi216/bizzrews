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
    });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
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
    try {
      if (form.id) {
        const updated = await session.authorized((token) =>
          dashboardApi.updateField(token, experienceId, form.id!, payload),
        );
        setFields((items) =>
          items.map((item) => (item.id === updated.id ? updated : item)),
        );
      } else {
        const created = await session.authorized((token) =>
          dashboardApi.createField(token, experienceId, {
            ...payload,
            position: fields.length,
          }),
        );
        setFields((items) => [...items, created]);
      }
      setForm(null);
    } catch (value) {
      setError(
        value instanceof Error ? value.message : 'Could not save question.',
      );
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
    const previous = fields;
    const next = [...fields];
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
            {optionTypes.includes(field.type) && (
              <OptionsEditor
                experienceId={experienceId}
                field={field}
                setField={(next) =>
                  setFields((items) =>
                    items.map((item) => (item.id === next.id ? next : item)),
                  )
                }
                writable={writable}
              />
            )}
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
}: {
  form: FormState;
  setForm: (value: FormState) => void;
  save: (event: FormEvent) => void;
  cancel: () => void;
}) {
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
            setForm({ ...form, type: e.target.value as FieldType })
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
              required: true,
              label: form.label || 'I accept the conditions',
            })
          }
        >
          Use consent template
        </button>
      )}
      <button>Save question</button>
    </form>
  );
}

function OptionsEditor({
  experienceId,
  field,
  setField,
  writable,
}: {
  experienceId: string;
  field: DraftField;
  setField: (field: DraftField) => void;
  writable: boolean;
}) {
  const session = useSession();
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  async function add(event: FormEvent) {
    event.preventDefault();
    try {
      const option = await session.authorized((token) =>
        dashboardApi.createOption(token, experienceId, field.id, {
          key: uniqueKey(
            label,
            field.options.map((item) => item.key),
          ),
          label,
          position: field.options.length,
        }),
      );
      setField({ ...field, options: [...field.options, option] });
      setLabel('');
    } catch (value) {
      setError(
        value instanceof Error ? value.message : 'Could not add option.',
      );
    }
  }
  async function update(
    option: DraftField['options'][number],
    nextLabel: string,
  ) {
    const updated = await session.authorized((token) =>
      dashboardApi.updateOption(token, experienceId, field.id, option.id, {
        label: nextLabel,
      }),
    );
    setField({
      ...field,
      options: field.options.map((item) =>
        item.id === option.id ? updated : item,
      ),
    });
  }
  async function remove(optionId: string) {
    await session.authorized((token) =>
      dashboardApi.deleteOption(token, experienceId, field.id, optionId),
    );
    setField({
      ...field,
      options: field.options.filter((item) => item.id !== optionId),
    });
  }
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= field.options.length) return;
    const next = [...field.options];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const positioned = next.map((item, position) => ({ ...item, position }));
    setField({ ...field, options: positioned });
    await Promise.all(
      [positioned[index]!, positioned[target]!].map((item) =>
        session.authorized((token) =>
          dashboardApi.updateOption(token, experienceId, field.id, item.id, {
            position: item.position,
          }),
        ),
      ),
    );
  }
  return (
    <div className="options-editor">
      <h5>Options</h5>
      {field.options.map((option, index) => (
        <OptionRow
          key={option.id}
          option={option}
          writable={writable}
          save={(value) => update(option, value)}
          remove={() => remove(option.id)}
          up={() => move(index, -1)}
          down={() => move(index, 1)}
          first={index === 0}
          last={index === field.options.length - 1}
        />
      ))}
      {writable && (
        <form className="inline-form" onSubmit={(e) => void add(e)}>
          <input
            aria-label="Option label"
            required
            placeholder="New option label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button>+ Add option</button>
        </form>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function OptionRow({
  option,
  writable,
  save,
  remove,
  up,
  down,
  first,
  last,
}: {
  option: DraftField['options'][number];
  writable: boolean;
  save: (label: string) => Promise<void>;
  remove: () => Promise<void>;
  up: () => Promise<void>;
  down: () => Promise<void>;
  first: boolean;
  last: boolean;
}) {
  const [label, setLabel] = useState(option.label);
  return (
    <div className="option-row">
      <input
        disabled={!writable}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() =>
          label.trim() && label !== option.label && void save(label)
        }
      />
      {writable && (
        <>
          <button disabled={first} onClick={() => void up()}>
            ↑
          </button>
          <button disabled={last} onClick={() => void down()}>
            ↓
          </button>
          <button className="danger-link" onClick={() => void remove()}>
            Delete
          </button>
        </>
      )}
    </div>
  );
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
