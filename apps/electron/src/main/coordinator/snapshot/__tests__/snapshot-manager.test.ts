import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SnapshotManager } from '../snapshot-manager';

async function write(root: string, rel: string, data: string) {
  const abs = path.join(root, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
}

async function read(root: string, rel: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(root, rel), 'utf-8');
  } catch {
    return null;
  }
}

describe('SnapshotManager', () => {
  let workspace: string;
  let mgr: SnapshotManager;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'snap-ws-'));
    mgr = new SnapshotManager();
    mgr.setWorkspacePath(workspace);
  });

  afterEach(async () => {
    mgr.clearWorkspacePath();
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it('track → modify → restore brings files back', async () => {
    await write(workspace, 'a.md', 'v1');
    await write(workspace, 'b.md', 'hi');

    const { snapshotId } = await mgr.track({ sessionID: 's1', messageID: 'm1' });
    expect(snapshotId).toBeTruthy();

    await write(workspace, 'a.md', 'v2-CHANGED');
    await fs.unlink(path.join(workspace, 'b.md'));
    await write(workspace, 'c.md', 'new file');

    const res = await mgr.restore(snapshotId!);
    expect(res.success).toBe(true);
    expect(await read(workspace, 'a.md')).toBe('v1');
    expect(await read(workspace, 'b.md')).toBe('hi');
    expect(await read(workspace, 'c.md')).toBe(null); // deleted by restore
  });

  it('revert restores state before the prompt; unrevert walks forward', async () => {
    // Simulates the real flow: track BEFORE prompt, then AI edits.
    await write(workspace, 'a.md', 'v0');
    await mgr.track({ sessionID: 's1', messageID: 'm1' }); // captures v0
    await write(workspace, 'a.md', 'v1 (after prompt 1)'); // AI edit

    await mgr.track({ sessionID: 's1', messageID: 'm2' }); // captures v1
    await write(workspace, 'a.md', 'v2 (after prompt 2)'); // AI edit

    // Undo prompt 2 → file should contain v1 (state before prompt 2 ran)
    const rev = await mgr.revertToMessage({ sessionID: 's1', messageID: 'm2' });
    expect(rev.success).toBe(true);
    expect(await read(workspace, 'a.md')).toBe('v1 (after prompt 1)');

    // Redo → file should return to v2 (state at the moment of undo)
    const un = await mgr.unrevert({ sessionID: 's1' });
    expect(un.success).toBe(true);
    expect(await read(workspace, 'a.md')).toBe('v2 (after prompt 2)');
  });

  it('undo of a file-creating turn preserves the created file', async () => {
    // Empty workspace, prompt 1 creates a file, prompt 2 edits it.
    await mgr.track({ sessionID: 's1', messageID: 'm1' }); // captures empty
    await write(workspace, 'new.md', 'created by prompt 1');

    await mgr.track({ sessionID: 's1', messageID: 'm2' }); // captures file exists
    await write(workspace, 'new.md', 'extended by prompt 2');

    // Undo prompt 2: file should still exist with prompt 1's content
    await mgr.revertToMessage({ sessionID: 's1', messageID: 'm2' });
    expect(await read(workspace, 'new.md')).toBe('created by prompt 1');

    // Undo prompt 1: now the file should be gone (pre-creation state)
    await mgr.revertToMessage({ sessionID: 's1', messageID: 'm1' });
    expect(await read(workspace, 'new.md')).toBe(null);
  });

  it('skips files over 100MB and reports them', async () => {
    await write(workspace, 'small.md', 'ok');
    const bigPath = path.join(workspace, 'big.bin');
    const fh = await fs.open(bigPath, 'w');
    await fh.truncate(101 * 1024 * 1024);
    await fh.close();

    const result = await mgr.track({ sessionID: 's1', messageID: 'm1' });
    expect(result.snapshotId).toBeTruthy();
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].path).toBe('big.bin');
  });

  it('dedupes identical content across turns (no blob growth)', async () => {
    await write(workspace, 'a.md', 'same');
    await mgr.track({ sessionID: 's1', messageID: 'm1' });
    await mgr.track({ sessionID: 's1', messageID: 'm2' });
    await mgr.track({ sessionID: 's1', messageID: 'm3' });

    const blobsDir = path.join(workspace, '.cushion', 'snapshots', 'blobs');
    const subs = await fs.readdir(blobsDir, { withFileTypes: true });
    let blobCount = 0;
    for (const s of subs) {
      if (!s.isDirectory()) continue;
      const inner = await fs.readdir(path.join(blobsDir, s.name));
      blobCount += inner.length;
    }
    expect(blobCount).toBe(1);
  });

  it('prune drops turns older than cutoff and GCs unreferenced blobs', async () => {
    await write(workspace, 'a.md', 'old');
    const first = await mgr.track({ sessionID: 's1', messageID: 'm1' });

    await write(workspace, 'a.md', 'current');
    await mgr.track({ sessionID: 's1', messageID: 'm2' });

    // Backdate first manifest + turn
    const snapshotsRoot = path.join(workspace, '.cushion', 'snapshots');
    const statePath = path.join(snapshotsRoot, 'state.json');
    const state = JSON.parse(await fs.readFile(statePath, 'utf-8'));
    const ancient = Date.now() - 60 * 86400_000;
    state.turns[0].ts = ancient;
    await fs.writeFile(statePath, JSON.stringify(state));

    const res = await mgr.prune({ maxAgeDays: 30 });
    expect(res.removedTurns).toBe(1);
    expect(res.removedBlobs).toBe(1); // 'old' blob no longer referenced

    // manifest for old turn should be gone
    const manifestPath = path.join(snapshotsRoot, 'manifests', `${first.snapshotId}.json`);
    await expect(fs.access(manifestPath)).rejects.toThrow();
  });
});
