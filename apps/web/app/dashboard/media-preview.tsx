'use client';
import Image from 'next/image';
import { useState } from 'react';
import { dashboardMediaUrl } from '../../lib/api/dashboard';

export function MediaPreview({
  mediaId,
  alt,
  className,
  width,
  height,
}: {
  mediaId: string;
  alt: string;
  className?: string;
  width: number;
  height: number;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (failed)
    return (
      <div className="media-load-error" role="alert">
        <span>Image could not be loaded.</span>
        <button
          type="button"
          onClick={() => {
            setAttempt((value) => value + 1);
            setFailed(false);
          }}
        >
          Retry
        </button>
      </div>
    );
  return (
    <Image
      unoptimized
      className={className}
      src={`${dashboardMediaUrl(mediaId)}?attempt=${attempt}`}
      alt={alt}
      width={width}
      height={height}
      onError={() => setFailed(true)}
    />
  );
}
