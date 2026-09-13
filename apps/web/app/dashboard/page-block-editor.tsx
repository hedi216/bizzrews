'use client';
import Image from 'next/image';
import { useState } from 'react';
import {
  dashboardApi,
  dashboardMediaUrl,
  type Organization,
  type PageBlock,
  type PageBlockType,
} from '../../lib/api/dashboard';
import { useSession } from '../providers';

const labels: Record<PageBlockType, string> = {
  HERO: 'Hero',
  FORM: 'Booking form',
  GALLERY: 'Gallery',
  TEXT: 'Text',
  ITINERARY: 'Itinerary',
  LOCATION: 'Location',
  CTA: 'Button',
  LOGO: 'Business logo',
};
const types = Object.keys(labels) as PageBlockType[];
const defaults: Record<PageBlockType, Record<string, unknown>> = {
  HERO: {
    headline: 'A memorable experience',
    subheading: 'Tell customers what makes it special.',
  },
  TEXT: { heading: 'About', body: 'Tell customers what to expect.' },
  GALLERY: { heading: 'Gallery', images: [] },
  LOCATION: { name: 'Location', address: 'Add an address' },
  ITINERARY: { heading: 'Itinerary', items: ['Arrival and welcome'] },
  FORM: { heading: 'Book your place', submitLabel: 'Confirm reservation' },
  CTA: { label: 'Book now', href: '#booking' },
  LOGO: { alignment: 'center', size: 'medium' },
};

export function PageBlockEditor({
  experienceId,
  businessId,
  initial,
  role,
}: {
  experienceId: string;
  businessId: string;
  initial: PageBlock[];
  role: Organization['role'];
}) {
  const session = useSession();
  const [blocks, setBlocks] = useState(initial);
  const [type, setType] = useState<PageBlockType>('TEXT');
  const [error, setError] = useState('');
  const writable = role !== 'STAFF';
  async function add() {
    try {
      const created = await session.authorized((token) =>
        dashboardApi.createPageBlock(token, experienceId, {
          type,
          position: blocks.length,
          config: defaults[type],
          media: [],
        }),
      );
      setBlocks([...blocks, created]);
    } catch (value) {
      setError(message(value));
    }
  }
  async function save(block: PageBlock) {
    try {
      const updated = await session.authorized((token) =>
        dashboardApi.updatePageBlock(token, experienceId, block.id, {
          config: block.config,
        }),
      );
      setBlocks((items) =>
        items.map((item) =>
          item.id === block.id ? { ...item, ...updated } : item,
        ),
      );
    } catch (value) {
      setError(message(value));
    }
  }
  async function remove(block: PageBlock) {
    try {
      for (const media of block.media)
        await session.authorized((token) =>
          dashboardApi.deletePageBlockMedia(
            token,
            experienceId,
            block.id,
            media.id,
          ),
        );
      await session.authorized((token) =>
        dashboardApi.deletePageBlock(token, experienceId, block.id),
      );
      setBlocks(blocks.filter((item) => item.id !== block.id));
    } catch (value) {
      setError(message(value));
    }
  }
  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const old = blocks;
    const next = [...blocks];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const positioned = next.map((block, position) => ({ ...block, position }));
    setBlocks(positioned);
    try {
      await Promise.all(
        [positioned[index]!, positioned[target]!].map((block) =>
          session.authorized((token) =>
            dashboardApi.updatePageBlock(token, experienceId, block.id, {
              position: block.position,
            }),
          ),
        ),
      );
    } catch (value) {
      setBlocks(old);
      setError(message(value));
    }
  }
  function change(id: string, config: Record<string, unknown>) {
    setBlocks((items) =>
      items.map((item) => (item.id === id ? { ...item, config } : item)),
    );
  }
  async function upload(block: PageBlock, files: FileList | null) {
    if (!files?.length) return;
    try {
      let media = [...block.media];
      const selected = Array.from(files);
      if (block.type === 'HERO') {
        const asset = await session.authorized((token) =>
          dashboardApi.uploadMedia(token, businessId, selected[0]!),
        );
        if (media[0])
          await session.authorized((token) =>
            dashboardApi.deletePageBlockMedia(
              token,
              experienceId,
              block.id,
              media[0]!.id,
            ),
          );
        const attached = await session.authorized((token) =>
          dashboardApi.attachPageBlockMedia(
            token,
            experienceId,
            block.id,
            asset.id,
            0,
          ),
        );
        media = [attached];
      } else {
        for (const file of selected) {
          const asset = await session.authorized((token) =>
            dashboardApi.uploadMedia(token, businessId, file),
          );
          const attached = await session.authorized((token) =>
            dashboardApi.attachPageBlockMedia(
              token,
              experienceId,
              block.id,
              asset.id,
              media.length,
            ),
          );
          media.push(attached);
        }
      }
      setBlocks((items) =>
        items.map((item) => (item.id === block.id ? { ...item, media } : item)),
      );
    } catch (value) {
      setError(message(value));
    }
  }
  async function removeMedia(block: PageBlock, id: string) {
    await session.authorized((token) =>
      dashboardApi.deletePageBlockMedia(token, experienceId, block.id, id),
    );
    setBlocks((items) =>
      items.map((item) =>
        item.id === block.id
          ? { ...item, media: item.media.filter((media) => media.id !== id) }
          : item,
      ),
    );
  }
  async function moveMedia(block: PageBlock, index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= block.media.length) return;
    const media = [...block.media];
    [media[index], media[target]] = [media[target]!, media[index]!];
    const positioned = media.map((item, position) => ({ ...item, position }));
    setBlocks((items) =>
      items.map((item) =>
        item.id === block.id ? { ...item, media: positioned } : item,
      ),
    );
    await Promise.all(
      [positioned[index]!, positioned[target]!].map((item) =>
        session.authorized((token) =>
          dashboardApi.reorderPageBlockMedia(
            token,
            experienceId,
            block.id,
            item.id,
            item.position,
          ),
        ),
      ),
    );
  }
  return (
    <section className="builder-panel page-designer">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Page design</p>
          <h3>Build your public page</h3>
          <p className="muted">
            Add and arrange sections. Positions are saved automatically.
          </p>
        </div>
      </div>
      {error && <p className="notice error">{error}</p>}
      <div className="builder-list">
        {blocks.map((block, index) => (
          <article className="page-block-card" key={block.id}>
            <div className="card-summary">
              <div>
                <span className="section-icon">{index + 1}</span>
                <strong>{labels[block.type]}</strong>
              </div>
              {writable && (
                <div className="row-actions">
                  <button
                    disabled={index === 0}
                    onClick={() => void move(index, -1)}
                  >
                    Move up
                  </button>
                  <button
                    disabled={index === blocks.length - 1}
                    onClick={() => void move(index, 1)}
                  >
                    Move down
                  </button>
                  <button
                    className="danger-link"
                    onClick={() => void remove(block)}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
            <FriendlyConfig
              block={block}
              disabled={!writable}
              change={(config) => change(block.id, config)}
            />
            {['HERO', 'GALLERY'].includes(block.type) && (
              <div className="media-editor">
                <div className="media-grid">
                  {block.media.map((media, mediaIndex) => (
                    <div className="media-tile" key={media.id}>
                      <Image
                        unoptimized
                        src={dashboardMediaUrl(media.mediaAsset.id)}
                        alt="Uploaded presentation"
                        width={180}
                        height={110}
                      />
                      {writable && (
                        <div>
                          <button
                            disabled={mediaIndex === 0}
                            onClick={() =>
                              void moveMedia(block, mediaIndex, -1)
                            }
                          >
                            ←
                          </button>
                          <button
                            disabled={mediaIndex === block.media.length - 1}
                            onClick={() => void moveMedia(block, mediaIndex, 1)}
                          >
                            →
                          </button>
                          <button
                            onClick={() => void removeMedia(block, media.id)}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {writable && (
                  <label className="secondary-button upload-button">
                    {block.type === 'HERO' && block.media.length
                      ? 'Replace image'
                      : block.type === 'GALLERY'
                        ? '+ Upload photos'
                        : 'Upload image'}
                    <input
                      type="file"
                      multiple={block.type === 'GALLERY'}
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) =>
                        void upload(block, event.target.files)
                      }
                    />
                  </label>
                )}
              </div>
            )}
            {writable && (
              <button onClick={() => void save(block)}>Save section</button>
            )}
          </article>
        ))}
      </div>
      {writable && (
        <div className="add-section">
          <select
            aria-label="Section type"
            value={type}
            onChange={(e) => setType(e.target.value as PageBlockType)}
          >
            {types
              .filter(
                (item) =>
                  item !== 'FORM' ||
                  !blocks.some((block) => block.type === 'FORM'),
              )
              .map((item) => (
                <option value={item} key={item}>
                  {labels[item]}
                </option>
              ))}
          </select>
          <button onClick={() => void add()}>+ Add section</button>
        </div>
      )}
    </section>
  );
}

function FriendlyConfig({
  block,
  disabled,
  change,
}: {
  block: PageBlock;
  disabled: boolean;
  change: (config: Record<string, unknown>) => void;
}) {
  const value = (key: string) =>
    typeof block.config[key] === 'string' ? String(block.config[key]) : '';
  const input = (key: string, label: string, area = false) => (
    <label className={area ? 'wide' : ''}>
      {label}
      {area ? (
        <textarea
          disabled={disabled}
          value={value(key)}
          onChange={(e) => change({ ...block.config, [key]: e.target.value })}
        />
      ) : (
        <input
          disabled={disabled}
          value={value(key)}
          onChange={(e) => change({ ...block.config, [key]: e.target.value })}
        />
      )}
    </label>
  );
  if (block.type === 'HERO')
    return (
      <div className="friendly-config">
        {input('headline', 'Headline')}
        {input('subheading', 'Subheading')}
      </div>
    );
  if (block.type === 'TEXT')
    return (
      <div className="friendly-config">
        {input('heading', 'Heading')}
        {input('body', 'Body', true)}
      </div>
    );
  if (block.type === 'GALLERY')
    return (
      <div className="friendly-config">
        {input('heading', 'Gallery heading')}
      </div>
    );
  if (block.type === 'LOCATION')
    return (
      <div className="friendly-config">
        {input('name', 'Location name')}
        {input('address', 'Address')}
        {input('mapUrl', 'Map link')}
      </div>
    );
  if (block.type === 'CTA')
    return (
      <div className="friendly-config">
        {input('label', 'Button label')}
        {input('href', 'Destination')}
      </div>
    );
  if (block.type === 'FORM')
    return (
      <div className="friendly-config">
        {input('heading', 'Section heading')}
        {input('submitLabel', 'Confirmation button label')}
      </div>
    );
  if (block.type === 'LOGO')
    return (
      <div className="friendly-config">
        <label>
          Alignment
          <select
            disabled={disabled}
            value={value('alignment') || 'center'}
            onChange={(e) =>
              change({ ...block.config, alignment: e.target.value })
            }
          >
            <option>left</option>
            <option>center</option>
            <option>right</option>
          </select>
        </label>
        <label>
          Size
          <select
            disabled={disabled}
            value={value('size') || 'medium'}
            onChange={(e) => change({ ...block.config, size: e.target.value })}
          >
            <option>small</option>
            <option>medium</option>
            <option>large</option>
          </select>
        </label>
      </div>
    );
  const items = Array.isArray(block.config.items)
    ? block.config.items.map(String)
    : [];
  return (
    <div className="friendly-config itinerary-config">
      {input('heading', 'Itinerary heading')}
      <div className="wide">
        <strong>Checkpoints</strong>
        {items.map((item, index) => (
          <div className="checkpoint" key={index}>
            <input
              disabled={disabled}
              value={item}
              onChange={(e) =>
                change({
                  ...block.config,
                  items: items.map((current, position) =>
                    position === index ? e.target.value : current,
                  ),
                })
              }
            />
            {!disabled && (
              <>
                <button
                  disabled={index === 0}
                  onClick={() =>
                    change({
                      ...block.config,
                      items: swap(items, index, index - 1),
                    })
                  }
                >
                  ↑
                </button>
                <button
                  disabled={index === items.length - 1}
                  onClick={() =>
                    change({
                      ...block.config,
                      items: swap(items, index, index + 1),
                    })
                  }
                >
                  ↓
                </button>
                <button
                  onClick={() =>
                    change({
                      ...block.config,
                      items: items.filter((_, position) => position !== index),
                    })
                  }
                >
                  Delete
                </button>
              </>
            )}
          </div>
        ))}
        {!disabled && (
          <button
            className="secondary-button"
            onClick={() =>
              change({ ...block.config, items: [...items, 'New checkpoint'] })
            }
          >
            + Add checkpoint
          </button>
        )}
      </div>
    </div>
  );
}
function swap<T>(items: T[], from: number, to: number) {
  const next = [...items];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}
function message(value: unknown) {
  return value instanceof Error ? value.message : 'Could not update page.';
}
