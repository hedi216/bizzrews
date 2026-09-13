'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  dashboardApi,
  type Experience,
  type Organization,
  type Revision,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';
import { FieldEditor } from './field-editor';
import { BookingsManager } from './bookings-manager';
import { AssignmentManager } from './assignment-manager';
import { PageBlockEditor } from './page-block-editor';
export function ExperienceEditor({
  experience,
  role,
  onClose,
  onChanged,
  timezone,
  businessId,
}: {
  experience: Experience;
  role: Organization['role'];
  onClose: () => void;
  onChanged: (x: Experience) => void;
  timezone: string;
  businessId: string;
}) {
  const session = useSession(),
    [detail, setDetail] = useState<Experience>(experience),
    [draft, setDraft] = useState<Revision | null>(experience.draft),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const writable = role !== 'STAFF';
  const paymentBlocksOpening =
    detail.publishedRevision?.paymentMode !== undefined &&
    detail.publishedRevision.paymentMode !== 'NONE';
  useEffect(() => {
    let active = true;
    void session
      .authorized((t) => dashboardApi.experience(t, experience.id))
      .then((x) => {
        if (active) {
          setDetail(x);
          setDraft(x.draft);
        }
      })
      .catch(() => active && setError('Could not load Experience.'));
    return () => {
      active = false;
    };
  }, [experience.id, session]);
  async function act(task: (token: string) => Promise<unknown>) {
    setPending(true);
    setError('');
    try {
      await session.authorized(task);
      const fresh = await session.authorized((t) =>
        dashboardApi.experience(t, experience.id),
      );
      setDetail(fresh);
      setDraft(fresh.draft);
      onChanged(fresh);
    } catch (x) {
      setError(x instanceof Error ? x.message : 'Action failed.');
    } finally {
      setPending(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    await act((t) =>
      dashboardApi.updateDraft(t, experience.id, {
        name: draft.name,
        description: draft.description,
        cancellationTerms: draft.cancellationTerms,
        priceAmount: draft.priceAmount,
        currency: draft.currency,
        paymentMode: draft.paymentMode,
        depositAmount:
          draft.paymentMode === 'DEPOSIT'
            ? (draft.depositAmount ?? '')
            : undefined,
        schedulingMode: draft.schedulingMode,
        durationMinutes:
          draft.schedulingMode === 'GENERATED_SLOTS'
            ? (draft.durationMinutes ?? 30)
            : undefined,
        slotIntervalMinutes:
          draft.schedulingMode === 'GENERATED_SLOTS'
            ? (draft.slotIntervalMinutes ?? 30)
            : undefined,
        bufferBeforeMinutes: draft.bufferBeforeMinutes ?? 0,
        bufferAfterMinutes: draft.bufferAfterMinutes ?? 0,
      }),
    );
  }
  return (
    <section className="experience-editor">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Experience editor</p>
          <h2>
            {draft?.name ?? detail.publishedRevision?.name ?? detail.slug}
          </h2>
        </div>
        <button className="secondary-button" onClick={onClose}>
          Close
        </button>
      </div>
      {error && <div className="notice error">{error}</div>}
      {draft ? (
        <form className="draft-form" onSubmit={(e) => void save(e)}>
          <Input
            label="Name"
            value={draft.name}
            set={(name) => setDraft({ ...draft, name })}
          />
          <Input
            label="Price"
            value={draft.priceAmount}
            set={(priceAmount) => setDraft({ ...draft, priceAmount })}
          />
          <Input
            label="Currency"
            value={draft.currency}
            set={(currency) => setDraft({ ...draft, currency })}
          />
          <label>
            Payment mode
            <select
              value={draft.paymentMode}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  paymentMode: e.target.value as Revision['paymentMode'],
                  depositAmount:
                    e.target.value === 'DEPOSIT' ? draft.depositAmount : null,
                })
              }
            >
              <option value="NONE">No online payment</option>
              <option
                value="OPTIONAL"
                disabled={draft.paymentMode !== 'OPTIONAL'}
              >
                Optional payment — coming soon
              </option>
              <option
                value="REQUIRED"
                disabled={draft.paymentMode !== 'REQUIRED'}
              >
                Required payment — coming soon
              </option>
              <option
                value="DEPOSIT"
                disabled={draft.paymentMode !== 'DEPOSIT'}
              >
                Deposit — coming soon
              </option>
            </select>
            {draft.paymentMode !== 'NONE' && (
              <small>
                Online reservations cannot be opened until payment processing is
                available. Select “No online payment” to accept bookings.
              </small>
            )}
          </label>
          {draft.paymentMode === 'DEPOSIT' && (
            <Input
              label="Deposit amount"
              value={draft.depositAmount ?? ''}
              set={(depositAmount) => setDraft({ ...draft, depositAmount })}
            />
          )}
          <label>
            Scheduling mode
            <select
              value={draft.schedulingMode}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  schedulingMode: e.target.value as Revision['schedulingMode'],
                })
              }
            >
              <option value="EXPLICIT_OCCURRENCES">Explicit occurrences</option>
              <option value="GENERATED_SLOTS">Generated slots</option>
            </select>
          </label>
          {draft.schedulingMode === 'GENERATED_SLOTS' && (
            <>
              <NumberInput
                label="Duration (minutes)"
                value={draft.durationMinutes ?? 30}
                set={(durationMinutes) =>
                  setDraft({ ...draft, durationMinutes })
                }
              />
              <NumberInput
                label="Slot interval (minutes)"
                value={draft.slotIntervalMinutes ?? 30}
                set={(slotIntervalMinutes) =>
                  setDraft({ ...draft, slotIntervalMinutes })
                }
              />
              <NumberInput
                label="Buffer before (minutes)"
                min={0}
                max={1440}
                value={draft.bufferBeforeMinutes ?? 0}
                set={(bufferBeforeMinutes) =>
                  setDraft({ ...draft, bufferBeforeMinutes })
                }
              />
              <NumberInput
                label="Buffer after (minutes)"
                min={0}
                max={1440}
                value={draft.bufferAfterMinutes ?? 0}
                set={(bufferAfterMinutes) =>
                  setDraft({ ...draft, bufferAfterMinutes })
                }
              />
            </>
          )}
          <label className="wide">
            Description
            <textarea
              value={draft.description ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value || null })
              }
            />
          </label>
          <label className="wide">
            Cancellation terms
            <textarea
              value={draft.cancellationTerms ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  cancellationTerms: e.target.value || null,
                })
              }
            />
          </label>
          {writable && (
            <div className="editor-actions wide">
              <button disabled={pending}>Save draft</button>
              <button
                type="button"
                className="secondary-button"
                disabled={pending}
                onClick={() =>
                  void act((t) => dashboardApi.publish(t, experience.id))
                }
              >
                Publish
              </button>
            </div>
          )}
        </form>
      ) : (
        <div className="published-state">
          <p>
            Published version {detail.publishedRevision?.version}. Create a new
            draft to make changes.
          </p>
          {writable && (
            <button
              disabled={pending}
              onClick={() =>
                void act((t) => dashboardApi.createDraft(t, experience.id))
              }
            >
              Create next draft
            </button>
          )}
        </div>
      )}
      {draft?.fields && (
        <FieldEditor
          key={draft.id}
          experienceId={experience.id}
          initial={draft.fields}
          role={role}
        />
      )}
      {draft?.pageBlocks && (
        <PageBlockEditor
          key={`page-${draft.id}`}
          experienceId={experience.id}
          initial={draft.pageBlocks}
          role={role}
        />
      )}
      <AssignmentManager
        businessId={businessId}
        experienceId={experience.id}
        role={role}
      />
      <BookingsManager
        experienceId={experience.id}
        role={role}
        timezone={timezone}
        explicit={
          (draft?.schedulingMode ??
            detail.publishedRevision?.schedulingMode) === 'EXPLICIT_OCCURRENCES'
        }
      />
      <div className="editor-actions">
        <a
          className="secondary-button"
          href={`/${detail.business?.slug ?? ''}/${detail.slug}`}
          target="_blank"
        >
          View public page
        </a>
        {writable && detail.publishedRevision && (
          <button
            disabled={
              pending || (paymentBlocksOpening && !detail.acceptingReservations)
            }
            onClick={() =>
              void act((t) =>
                dashboardApi.setReservations(
                  t,
                  experience.id,
                  !detail.acceptingReservations,
                ),
              )
            }
          >
            {detail.acceptingReservations
              ? 'Close reservations'
              : paymentBlocksOpening
                ? 'Online payments coming soon'
                : 'Open reservations'}
          </button>
        )}
      </div>
    </section>
  );
}
function Input({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <input required value={value} onChange={(e) => set(e.target.value)} />
    </label>
  );
}
function NumberInput({
  label,
  value,
  set,
  min = 1,
  max,
}: {
  label: string;
  value: number;
  set: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        min={min}
        max={max}
        required
        value={value}
        onChange={(e) => set(Number(e.target.value))}
      />
    </label>
  );
}
