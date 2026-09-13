import type { Business, Revision } from '../../lib/api/dashboard';
import { PageBlocks } from '../[businessSlug]/[experienceSlug]/page-blocks';
import { fieldTypeLabel } from '../../lib/builder-utils';

export function DraftPreview({
  draft,
  business,
}: {
  draft: Revision;
  business?: Pick<Business, 'logoMedia'>;
}) {
  const form = (
    <div className="draft-form-preview">
      <h4>Booking form</h4>
      {['Full name', 'Phone', 'Email'].map((label) => (
        <div key={label}>
          {label} <span>Required</span>
        </div>
      ))}
      {draft.fields?.map((field) => (
        <div key={field.id}>
          {field.label}{' '}
          <span>
            {fieldTypeLabel[field.type]}
            {field.required ? ' · Required' : ''}
          </span>
        </div>
      ))}
    </div>
  );
  return (
    <div className="draft-preview">
      <p className="preview-label">Draft preview</p>
      <PageBlocks
        blocks={draft.pageBlocks ?? []}
        booking={form}
        businessLogoId={business?.logoMedia?.id}
      />
    </div>
  );
}
