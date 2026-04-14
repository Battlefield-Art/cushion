import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { walkWorkspace } from '../workspace-walker';

describe('walkWorkspace', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'walk-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('lists files recursively with POSIX-style relative paths', async () => {
    await fs.writeFile(path.join(tmpDir, 'top.md'), 'top');
    await fs.mkdir(path.join(tmpDir, 'sub'));
    await fs.writeFile(path.join(tmpDir, 'sub', 'nested.md'), 'nested');

    const files = await walkWorkspace(tmpDir);
    const paths = files.map((f) => f.relPath).sort();
    expect(paths).toEqual(['sub/nested.md', 'top.md']);
  });

  it('ignores .cushion, .git, and node_modules directories', async () => {
    await fs.writeFile(path.join(tmpDir, 'keep.md'), 'k');
    for (const ignored of ['.cushion', '.git', 'node_modules']) {
      await fs.mkdir(path.join(tmpDir, ignored));
      await fs.writeFile(path.join(tmpDir, ignored, 'junk.txt'), 'x');
    }

    const files = await walkWorkspace(tmpDir);
    const paths = files.map((f) => f.relPath);
    expect(paths).toEqual(['keep.md']);
  });

  it('returns empty for non-existent root', async () => {
    const files = await walkWorkspace(path.join(tmpDir, 'does-not-exist'));
    expect(files).toEqual([]);
  });
});
