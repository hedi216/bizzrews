import type { ReactNode } from 'react';
import type { PublicExperience } from '../../../lib/api/public-booking';
import { bookingBlockIndex } from '../../../lib/page-block-layout';

type Block = PublicExperience['pageBlocks'][number];
const text = (block: Block, key: string) =>
  typeof block.config[key] === 'string' ? block.config[key] : '';

export function PageBlocks({
  blocks,
  booking,
}: {
  blocks: Block[];
  booking: ReactNode;
}) {
  const formIndex = bookingBlockIndex(blocks);
  const bookingSection = (heading?: string) => (
    <article className="page-block booking-block" id="booking">
      {heading && <h2>{heading}</h2>}
      {booking}
    </article>
  );
  return (
    <section className="public-blocks">
      {blocks.map((block, index) => {
        if (block.type === 'FORM')
          return index === formIndex ? (
            <div key={block.id}>{bookingSection(text(block, 'heading'))}</div>
          ) : null;
        if (block.type === 'HERO')
          return (
            <article className="page-block hero-block" key={block.id}>
              <h2>{text(block, 'headline')}</h2>
              <p>{text(block, 'subheading')}</p>
            </article>
          );
        if (block.type === 'TEXT')
          return (
            <article className="page-block" key={block.id}>
              <h2>{text(block, 'heading')}</h2>
              <p>{text(block, 'body')}</p>
            </article>
          );
        if (block.type === 'GALLERY') {
          const images = Array.isArray(block.config.images)
            ? block.config.images
            : [];
          return (
            <article className="page-block" key={block.id}>
              <h2>{text(block, 'heading')}</h2>
              <div className="gallery-grid">
                {images.map((url, index) => (
                  <div
                    className="gallery-image"
                    role="img"
                    aria-label={`Experience image ${index + 1}`}
                    style={{ backgroundImage: `url(${String(url)})` }}
                    key={String(url)}
                  />
                ))}
              </div>
            </article>
          );
        }
        if (block.type === 'LOCATION')
          return (
            <article className="page-block" key={block.id}>
              <h2>{text(block, 'name')}</h2>
              <p>{text(block, 'address')}</p>
              {text(block, 'mapUrl') && (
                <a
                  href={text(block, 'mapUrl')}
                  rel="noreferrer"
                  target="_blank"
                >
                  View map
                </a>
              )}
            </article>
          );
        if (block.type === 'ITINERARY') {
          const items = Array.isArray(block.config.items)
            ? block.config.items
            : [];
          return (
            <article className="page-block" key={block.id}>
              <h2>{text(block, 'heading')}</h2>
              <ol>
                {items.map((item) => (
                  <li key={String(item)}>{String(item)}</li>
                ))}
              </ol>
            </article>
          );
        }
        if (block.type === 'CTA')
          return (
            <article className="page-block" key={block.id}>
              <a
                className="public-cta"
                href={text(block, 'href') || '#booking'}
              >
                {text(block, 'label')}
              </a>
            </article>
          );
        return null;
      })}
      {formIndex === blocks.length && bookingSection()}
    </section>
  );
}
