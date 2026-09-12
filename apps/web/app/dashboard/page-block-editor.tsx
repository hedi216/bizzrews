'use client';
import { useState } from 'react';
import {
  dashboardApi,
  type Organization,
  type PageBlock,
  type PageBlockType,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';

const types: PageBlockType[] = [
  'HERO',
  'TEXT',
  'GALLERY',
  'LOCATION',
  'ITINERARY',
  'FORM',
  'CTA',
];
const defaults: Record<PageBlockType, Record<string, unknown>> = {
  HERO: { headline: 'A memorable experience' },
  TEXT: { body: 'Tell customers what to expect.' },
  GALLERY: { heading: 'Gallery', images: [] },
  LOCATION: { name: 'Location', address: 'Add an address' },
  ITINERARY: { heading: 'Itinerary', items: ['First step'] },
  FORM: { heading: 'Book your place' },
  CTA: { label: 'Book now' },
};
export function PageBlockEditor({
  experienceId,
  initial,
  role,
}: {
  experienceId: string;
  initial: PageBlock[];
  role: Organization['role'];
}) {
  const session = useSession();
  const [blocks, setBlocks] = useState(initial);
  const [type, setType] = useState<PageBlockType>('TEXT');
  const [error, setError] = useState('');
  const writable = role !== 'STAFF';
  async function run(
    task: (token: string) => Promise<unknown>,
    reload?: PageBlock[],
  ) {
    setError('');
    try {
      await session.authorized(task);
      if (reload) setBlocks(reload);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update page.');
    }
  }
  async function add() {
    let created: PageBlock | undefined;
    await run(async (t) => {
      created = await dashboardApi.createPageBlock(t, experienceId, {
        type,
        position: blocks.length,
        config: defaults[type],
      });
    }, undefined);
    if (created) setBlocks([...blocks, created]);
  }
  async function save(block: PageBlock) {
    await run((t) =>
      dashboardApi.updatePageBlock(t, experienceId, block.id, {
        type: block.type,
        position: block.position,
        config: block.config,
      }),
    );
  }
  async function remove(block: PageBlock) {
    await run((t) => dashboardApi.deletePageBlock(t, experienceId, block.id));
    setBlocks(blocks.filter((x) => x.id !== block.id));
  }
  return (
    <section className="editor-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Public page</p>
          <h3>Content blocks</h3>
        </div>
      </div>
      {error && <div className="notice error">{error}</div>}
      {blocks.map((block) => (
        <article className="management-card" key={block.id}>
          <label>
            Block type
            <select
              disabled={!writable}
              value={block.type}
              onChange={(e) =>
                setBlocks(
                  blocks.map((x) =>
                    x.id === block.id
                      ? {
                          ...x,
                          type: e.target.value as PageBlockType,
                          config: defaults[e.target.value as PageBlockType],
                        }
                      : x,
                  ),
                )
              }
            >
              {types.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            Position
            <input
              disabled={!writable}
              type="number"
              min="0"
              value={block.position}
              onChange={(e) =>
                setBlocks(
                  blocks.map((x) =>
                    x.id === block.id
                      ? { ...x, position: Number(e.target.value) }
                      : x,
                  ),
                )
              }
            />
          </label>
          <BlockConfig
            block={block}
            disabled={!writable}
            change={(config) =>
              setBlocks(
                blocks.map((x) => (x.id === block.id ? { ...x, config } : x)),
              )
            }
          />
          {writable && (
            <div className="editor-actions">
              <button onClick={() => void save(block)}>Save block</button>
              <button
                className="danger-button"
                onClick={() => void remove(block)}
              >
                Delete
              </button>
            </div>
          )}
        </article>
      ))}
      {writable && (
        <div className="inline-form">
          <select
            value={type}
            onChange={(e) => setType(e.target.value as PageBlockType)}
          >
            {types.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <button onClick={() => void add()}>Add block</button>
        </div>
      )}
    </section>
  );
}
function BlockConfig({
  block,
  disabled,
  change,
}: {
  block: PageBlock;
  disabled: boolean;
  change: (x: Record<string, unknown>) => void;
}) {
  const keys = Object.keys(defaults[block.type]);
  return (
    <>
      {keys.map((key) => {
        const value = block.config[key];
        const array = Array.isArray(value);
        return (
          <label className="wide" key={key}>
            {label(key)}
            <textarea
              disabled={disabled}
              value={array ? value.join('\n') : String(value ?? '')}
              onChange={(e) =>
                change({
                  ...block.config,
                  [key]: array
                    ? e.target.value
                        .split('\n')
                        .map((x) => x.trim())
                        .filter(Boolean)
                    : e.target.value,
                })
              }
            />
          </label>
        );
      })}
    </>
  );
}
function label(value: string) {
  return value
    .replace(/[A-Z]/g, (x) => ` ${x}`)
    .replace(/^./, (x) => x.toUpperCase());
}
