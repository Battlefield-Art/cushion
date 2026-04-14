import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  SnapshotId,
  SnapshotManifest,
  TurnRecord,
  SnapshotDiffEntry,
} from '@cushion/types';
import { writeFileAtomicWithRetry } from '../atomic-write';
import { ContentStore } from './content-store';
import { walkWorkspace } from './workspace-walker';

const MAX_TRACKED_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
const DEFAULT_PRUNE_DAYS = 30;

interface SnapshotState {
  version: 1;
  turns: TurnRecord[];
  head: SnapshotId | null;
  redoPointers: Record<string, SnapshotId | null>; // sessionID -> next snapshot to redo to
}

function emptyState(): SnapshotState {
  return { version: 1, turns: [], head: null, redoPointers: {} };
}

export class SnapshotManager {
  private workspacePath: string | null = null;
  private snapshotsDir: string | null = null;
  private manifestsDir: string | null = null;
  private statePath: string | null = null;
  private store: ContentStore | null = null;

  private mutex: Promise<unknown> = Promise.resolve();

  setWorkspacePath(workspacePath: string): void {
    this.workspacePath = workspacePath;
    const root = path.join(workspacePath, '.cushion', 'snapshots');
    this.snapshotsDir = root;
    this.manifestsDir = path.join(root, 'manifests');
    this.statePath = path.join(root, 'state.json');
    this.store = new ContentStore(path.join(root, 'blobs'));
  }

  clearWorkspacePath(): void {
    this.workspacePath = null;
    this.snapshotsDir = null;
    this.manifestsDir = null;
    this.statePath = null;
    this.store = null;
  }

  private async ensureReady(): Promise<void> {
    if (!this.workspacePath || !this.snapshotsDir || !this.manifestsDir || !this.store) {
      throw new Error('SnapshotManager: no workspace path set');
    }
    await fs.mkdir(this.manifestsDir, { recursive: true });
    await this.store.init();
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutex.then(fn, fn);
    this.mutex = next.catch(() => undefined);
    return next;
  }

  private async readState(): Promise<SnapshotState> {
    if (!this.statePath) throw new Error('SnapshotManager: not initialized');
    try {
      const raw = await fs.readFile(this.statePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<SnapshotState>;
      return {
        version: 1,
        turns: parsed.turns ?? [],
        head: parsed.head ?? null,
        redoPointers: parsed.redoPointers ?? {},
      };
    } catch {
      return emptyState();
    }
  }

  private async writeState(state: SnapshotState): Promise<void> {
    if (!this.statePath) throw new Error('SnapshotManager: not initialized');
    await writeFileAtomicWithRetry(this.statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  private manifestPath(id: SnapshotId): string {
    if (!this.manifestsDir) throw new Error('SnapshotManager: not initialized');
    return path.join(this.manifestsDir, `${id}.json`);
  }

  private async readManifest(id: SnapshotId): Promise<SnapshotManifest | null> {
    try {
      const raw = await fs.readFile(this.manifestPath(id), 'utf-8');
      return JSON.parse(raw) as SnapshotManifest;
    } catch {
      return null;
    }
  }

  private async writeManifest(id: SnapshotId, manifest: SnapshotManifest): Promise<void> {
    await writeFileAtomicWithRetry(this.manifestPath(id), JSON.stringify(manifest), 'utf-8');
  }

  async track(params: { sessionID: string; messageID: string }): Promise<{
    snapshotId: SnapshotId | null;
    skipped: { path: string; size: number }[];
  }> {
    return this.runExclusive(async () => {
      if (!this.workspacePath || !this.store) return { snapshotId: null, skipped: [] };
      await this.ensureReady();
      const captured = await this.captureCurrentSnapshot();

      const state = await this.readState();
      const turn: TurnRecord = {
        id: captured.id,
        sessionID: params.sessionID,
        messageID: params.messageID,
        ts: captured.ts,
        parentId: state.head,
      };
      state.turns.push(turn);
      state.head = captured.id;
      state.redoPointers[params.sessionID] = null;
      await this.writeState(state);

      return { snapshotId: captured.id, skipped: captured.skipped };
    });
  }

  private async captureCurrentSnapshot(): Promise<{
    id: SnapshotId;
    ts: number;
    skipped: { path: string; size: number }[];
  }> {
    if (!this.workspacePath || !this.store) throw new Error('SnapshotManager: not initialized');
    const files = await walkWorkspace(this.workspacePath);
    const manifestFiles: SnapshotManifest['files'] = {};
    const skipped: { path: string; size: number }[] = [];

    for (const f of files) {
      if (f.size > MAX_TRACKED_FILE_BYTES) {
        manifestFiles[f.relPath] = { size: f.size, skipped: true };
        skipped.push({ path: f.relPath, size: f.size });
        continue;
      }
      const sha = await this.store.hashFile(f.absPath);
      if (!(await this.store.has(sha))) {
        await this.store.writeBlobFromFile(sha, f.absPath);
      }
      manifestFiles[f.relPath] = { sha256: sha, size: f.size };
    }

    const id: SnapshotId = randomUUID();
    const ts = Date.now();
    const manifest: SnapshotManifest = { version: 1, ts, files: manifestFiles };
    await this.writeManifest(id, manifest);
    return { id, ts, skipped };
  }

  async restore(snapshotId: SnapshotId): Promise<{ success: boolean }> {
    return this.runExclusive(async () => {
      if (!this.workspacePath || !this.store) return { success: false };
      await this.ensureReady();

      const manifest = await this.readManifest(snapshotId);
      if (!manifest) return { success: false };

      const currentFiles = await walkWorkspace(this.workspacePath);
      const currentMap = new Map<string, { absPath: string; size: number }>();
      for (const f of currentFiles) currentMap.set(f.relPath, { absPath: f.absPath, size: f.size });

      // Apply: write files that differ, delete files not in manifest
      for (const [relPath, entry] of Object.entries(manifest.files)) {
        const abs = path.join(this.workspacePath, relPath);
        if ('skipped' in entry && entry.skipped) continue;
        const sha = (entry as { sha256: string }).sha256;
        const existing = currentMap.get(relPath);
        if (existing) {
          const existingSha = await this.store.hashFile(existing.absPath);
          if (existingSha === sha) continue;
        }
        await this.store.writeFileFromBlob(sha, abs);
      }

      for (const [relPath, info] of currentMap) {
        if (!(relPath in manifest.files)) {
          try {
            await fs.unlink(info.absPath);
          } catch {}
        }
      }

      const state = await this.readState();
      state.head = snapshotId;
      await this.writeState(state);

      return { success: true };
    });
  }

  async revertToMessage(params: { sessionID: string; messageID: string }): Promise<{
    success: boolean;
    restoredSnapshotId: SnapshotId | null;
  }> {
    const preState = await this.readState();
    const turn = preState.turns.find(
      (t) => t.sessionID === params.sessionID && t.messageID === params.messageID,
    );
    if (!turn) return { success: false, restoredSnapshotId: null };

    // Only capture the live workspace the first time we leave the tip. If an
    // anchor already exists for this session we're already in a reverted
    // state — preserve the original so full forward-redo returns to the
    // pre-undo workspace instead of being overwritten at each hop.
    let redoSnapshotId: SnapshotId | null = preState.redoPointers[params.sessionID] ?? null;
    if (!redoSnapshotId) {
      await this.runExclusive(async () => {
        if (!this.workspacePath || !this.store) return;
        await this.ensureReady();
        const captured = await this.captureCurrentSnapshot();
        redoSnapshotId = captured.id;
      });
    }

    // Restore the turn's own snapshot (state captured right before that prompt ran).
    const result = await this.restore(turn.id);
    if (!result.success) return { success: false, restoredSnapshotId: null };

    const updated = await this.readState();
    updated.redoPointers[params.sessionID] = redoSnapshotId;
    await this.writeState(updated);

    return { success: true, restoredSnapshotId: turn.id };
  }

  async unrevert(params: { sessionID: string }): Promise<{
    success: boolean;
    restoredSnapshotId: SnapshotId | null;
  }> {
    const state = await this.readState();
    const next = state.redoPointers[params.sessionID];
    if (!next) return { success: false, restoredSnapshotId: null };
    const result = await this.restore(next);
    if (!result.success) return { success: false, restoredSnapshotId: null };
    const updated = await this.readState();
    updated.redoPointers[params.sessionID] = null;
    await this.writeState(updated);
    return { success: true, restoredSnapshotId: next };
  }

  async diff(snapshotId: SnapshotId): Promise<{ entries: SnapshotDiffEntry[] }> {
    if (!this.workspacePath || !this.store) return { entries: [] };
    const manifest = await this.readManifest(snapshotId);
    if (!manifest) return { entries: [] };
    const state = await this.readState();
    const headManifest = state.head ? await this.readManifest(state.head) : null;
    const entries: SnapshotDiffEntry[] = [];
    const headFiles = headManifest?.files ?? {};

    for (const [relPath, entry] of Object.entries(manifest.files)) {
      const head = headFiles[relPath];
      if (!head) {
        entries.push({ path: relPath, status: 'added' });
        continue;
      }
      const a = 'sha256' in entry ? entry.sha256 : null;
      const b = 'sha256' in head ? head.sha256 : null;
      if (a !== b) entries.push({ path: relPath, status: 'modified' });
    }
    for (const relPath of Object.keys(headFiles)) {
      if (!(relPath in manifest.files)) {
        entries.push({ path: relPath, status: 'deleted' });
      }
    }
    return { entries };
  }

  async list(params: { sessionID?: string }): Promise<{
    turns: TurnRecord[];
    head: SnapshotId | null;
    revertPointers: Record<string, string | null>;
  }> {
    if (!this.workspacePath) return { turns: [], head: null, revertPointers: {} };
    await this.ensureReady();
    const state = await this.readState();
    const turns = params.sessionID
      ? state.turns.filter((t) => t.sessionID === params.sessionID)
      : state.turns;
    const revertPointers: Record<string, string | null> = {};
    for (const [sessionID, snapshotId] of Object.entries(state.redoPointers)) {
      if (!snapshotId) {
        revertPointers[sessionID] = null;
        continue;
      }
      const turn = state.turns.find((t) => t.id === snapshotId);
      revertPointers[sessionID] = turn ? turn.messageID : null;
    }
    return { turns, head: state.head, revertPointers };
  }

  async prune(params?: { maxAgeDays?: number }): Promise<{ removedTurns: number; removedBlobs: number }> {
    return this.runExclusive(async () => {
      if (!this.workspacePath || !this.store || !this.manifestsDir) {
        return { removedTurns: 0, removedBlobs: 0 };
      }
      await this.ensureReady();
      const maxAgeDays = params?.maxAgeDays ?? DEFAULT_PRUNE_DAYS;
      const cutoff = Date.now() - maxAgeDays * 86400_000;

      const state = await this.readState();
      const keep: TurnRecord[] = [];
      const dropped: TurnRecord[] = [];
      for (const turn of state.turns) {
        if (turn.ts < cutoff && turn.id !== state.head) {
          dropped.push(turn);
        } else {
          keep.push(turn);
        }
      }

      for (const turn of dropped) {
        try {
          await fs.unlink(this.manifestPath(turn.id));
        } catch {}
      }

      state.turns = keep;
      await this.writeState(state);

      // GC blobs that no remaining manifest references
      const referenced = new Set<string>();
      for (const turn of keep) {
        const manifest = await this.readManifest(turn.id);
        if (!manifest) continue;
        for (const entry of Object.values(manifest.files)) {
          if ('sha256' in entry) referenced.add(entry.sha256);
        }
      }
      const all = await this.store.listAll();
      let removedBlobs = 0;
      for (const sha of all) {
        if (!referenced.has(sha)) {
          await this.store.deleteBlob(sha);
          removedBlobs++;
        }
      }

      return { removedTurns: dropped.length, removedBlobs };
    });
  }
}
