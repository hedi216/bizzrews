'use client';
import type { AnswerValue } from '../../../lib/booking';
import type { PublicField } from '../../../lib/api/public-booking';

export function CustomField({
  field,
  value,
  error,
  onChange,
}: {
  field: PublicField;
  value: AnswerValue;
  error?: string;
  onChange: (value: AnswerValue) => void;
}) {
  const described = error
    ? `${field.id}-error`
    : field.helpText
      ? `${field.id}-help`
      : undefined;
  const common = {
    id: field.id,
    name: field.key,
    'aria-describedby': described,
    'aria-invalid': Boolean(error),
  };
  const rules = field.validation ?? {};
  let control;
  if (['TEXT', 'NUMBER', 'DATE', 'TIME'].includes(field.type))
    control = (
      <input
        {...common}
        type={field.type === 'TEXT' ? 'text' : field.type.toLowerCase()}
        inputMode={field.type === 'NUMBER' ? 'decimal' : undefined}
        value={typeof value === 'string' ? value : ''}
        placeholder={field.placeholder ?? undefined}
        minLength={
          field.type === 'TEXT' && typeof rules.minLength === 'number'
            ? rules.minLength
            : undefined
        }
        maxLength={
          field.type === 'TEXT' && typeof rules.maxLength === 'number'
            ? rules.maxLength
            : undefined
        }
        onChange={(e) => onChange(e.target.value)}
      />
    );
  else if (field.type === 'TEXTAREA')
    control = (
      <textarea
        {...common}
        rows={4}
        value={typeof value === 'string' ? value : ''}
        placeholder={field.placeholder ?? undefined}
        minLength={
          typeof rules.minLength === 'number' ? rules.minLength : undefined
        }
        maxLength={
          typeof rules.maxLength === 'number' ? rules.maxLength : undefined
        }
        onChange={(e) => onChange(e.target.value)}
      />
    );
  else if (field.type === 'SELECT')
    control = (
      <select
        {...common}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">Choose an option</option>
        {field.options.map((o) => (
          <option key={o.id} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    );
  else if (field.type === 'RADIO')
    control = (
      <div
        className="choice-list"
        role="radiogroup"
        aria-describedby={described}
      >
        {field.options.map((o) => (
          <label className="choice" key={o.id}>
            <input
              type="radio"
              name={field.key}
              checked={value === o.key}
              onChange={() => onChange(o.key)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    );
  else if (field.type === 'CHECKBOX')
    control = (
      <label className="choice">
        <input
          {...common}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{field.placeholder ?? 'Yes'}</span>
      </label>
    );
  else {
    const selected = Array.isArray(value) ? value : [];
    control = (
      <div className="choice-list" aria-describedby={described}>
        {field.options.map((o) => (
          <label className="choice" key={o.id}>
            <input
              type="checkbox"
              checked={selected.includes(o.key)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, o.key]
                    : selected.filter((key) => key !== o.key),
                )
              }
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    );
  }
  return (
    <div className="field">
      <label
        className="field-label"
        htmlFor={
          ['RADIO', 'MULTISELECT'].includes(field.type) ? undefined : field.id
        }
      >
        {field.label}
        {field.required && <span> *</span>}
      </label>
      {field.helpText && (
        <p className="field-help" id={`${field.id}-help`}>
          {field.helpText}
        </p>
      )}
      {control}
      {error && (
        <p className="field-error" id={`${field.id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
