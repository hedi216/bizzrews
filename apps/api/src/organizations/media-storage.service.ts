import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

@Injectable()
export class MediaStorageService {
  private readonly root = localMediaRoot(process.env.MEDIA_LOCAL_ROOT);

  async put(mimeType: string, bytes: Buffer) {
    this.ensureLocal();
    const extension = extensions[mimeType];
    if (!extension) throw new Error('Unsupported media type.');
    const storageKey = `${randomUUID()}.${extension}`;
    await mkdir(this.root, { recursive: true });
    await writeFile(this.path(storageKey), bytes, { flag: 'wx' });
    return storageKey;
  }

  async get(storageKey: string) {
    this.ensureLocal();
    return readFile(this.path(storageKey));
  }

  async remove(storageKey: string) {
    this.ensureLocal();
    await rm(this.path(storageKey), { force: true });
  }

  private path(storageKey: string) {
    if (!/^[0-9a-f-]{36}\.(?:jpg|png|webp)$/.test(storageKey))
      throw new Error('Invalid media storage key.');
    const path = resolve(this.root, storageKey);
    if (!path.startsWith(`${this.root}\\`) && !path.startsWith(`${this.root}/`))
      throw new Error('Invalid media storage key.');
    return path;
  }

  private ensureLocal() {
    const provider = process.env.MEDIA_STORAGE_PROVIDER;
    if (
      process.env.NODE_ENV === 'production' ||
      (provider !== 'LOCAL' && provider !== undefined && provider.trim() !== '')
    )
      throw new ServiceUnavailableException(
        'A durable media storage provider must be configured.',
      );
  }
}

export function localMediaRoot(configured?: string) {
  const value = configured?.trim();
  if (value) return resolve(value);
  return resolve(__dirname, '../../../..', '.data', 'media');
}
