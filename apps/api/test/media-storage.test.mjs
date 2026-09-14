/* global Buffer */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import {
  localMediaRoot,
  MediaStorageService,
} from '../dist/organizations/media-storage.service.js';

test('local media root is deterministic and persists through service recreation', async () => {
  const canonical = resolve(import.meta.dirname, '../../../.data/media');
  for (const value of [undefined, '', '   '])
    assert.equal(localMediaRoot(value), canonical);

  const explicit = await mkdtemp(join(tmpdir(), 'bizzres-media-'));
  const previous = process.env.MEDIA_LOCAL_ROOT;
  process.env.MEDIA_LOCAL_ROOT = explicit;
  try {
    const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const first = new MediaStorageService();
    const key = await first.put('image/png', bytes);
    assert.deepEqual(await first.get(key), bytes);
    const restarted = new MediaStorageService();
    assert.deepEqual(await restarted.get(key), bytes);
    assert.deepEqual(await readFile(resolve(explicit, key)), bytes);
  } finally {
    if (previous === undefined) delete process.env.MEDIA_LOCAL_ROOT;
    else process.env.MEDIA_LOCAL_ROOT = previous;
    await rm(explicit, { recursive: true, force: true });
  }
});
