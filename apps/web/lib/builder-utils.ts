export function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

export function fieldKey(value: string) {
  const key = slugify(value).replaceAll('-', '_').slice(0, 63);
  return /^[a-z]/.test(key) ? key : `question_${key || 'new'}`.slice(0, 63);
}

export function uniqueKey(label: string, existing: string[]) {
  const base = fieldKey(label);
  if (!existing.includes(base)) return base;
  let suffix = 2;
  while (
    existing.includes(`${base.slice(0, 60 - String(suffix).length)}_${suffix}`)
  )
    suffix += 1;
  return `${base.slice(0, 60 - String(suffix).length)}_${suffix}`;
}

export const fieldTypeLabel: Record<string, string> = {
  TEXT: 'Short text',
  TEXTAREA: 'Long text',
  NUMBER: 'Number',
  SELECT: 'Dropdown',
  RADIO: 'Single choice',
  CHECKBOX: 'Checkbox / consent',
  MULTISELECT: 'Multiple choices',
  DATE: 'Date',
  TIME: 'Time',
};
