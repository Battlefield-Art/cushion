import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { ContentStore } from '../content-store';

describe('ContentStore', () => {
  let tmpDir: string;
  let store: ContentStore;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'content-store-'));
    store = new ContentStore(path.join(tmpDir, 'blobs'));
    await store.init();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('hashes a file deterministically', async () => {
    const file = path.join(tmpDir, 'a.txt');
    await fs.writeFile(file, 'hello world');
    const h1 = await store.hashFile(file);
    const h2 = await store.hashFile(file);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes and reads a blob round-trip', async () => {
    const src = path.join(tmpDir, 'src.txt');
    await fs.writeFile(src, 'payload');
    const sha = await store.hashFile(src);
    expect(await store.has(sha)).toBe(false);
    await store.writeBlobFromFile(sha, src);
    expect(await store.has(sha)).toBe(true);

    const dest = path.join(tmpDir, 'out.txt');
    await store.writeFileFromBlob(sha, dest);
    expect(await fs.readFile(dest, 'utf-8')).toBe('payload');
  });

  it('dedupes identical content (same sha => one blob)', async () => {
    const a = path.join(tmpDir, 'a.txt');
    const b = path.join(tmpDir, 'b.txt');
    await fs.writeFile(a, 'same');
    await fs.writeFile(b, 'same');
    const shaA = await store.hashFile(a);
    const shaB = await store.hashFile(b);
    expect(shaA).toBe(shaB);
    await store.writeBlobFromFile(shaA, a);
    await store.writeBlobFromFile(shaB, b);
    const all = await store.listAll();
    expect(all).toHaveLength(1);
  });

  it('deletes blobs', async () => {
    const file = path.join(tmpDir, 'x.txt');
    await fs.writeFile(file, 'bye');
    const sha = await store.hashFile(file);
    await store.writeBlobFromFile(sha, file);
    await store.deleteBlob(sha);
    expect(await store.has(sha)).toBe(false);
  });
});
