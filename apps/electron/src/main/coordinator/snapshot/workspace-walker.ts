import fs from 'fs/promises';
import path from 'path';
import { IGNORED_PATTERNS } from '../constants';

const SNAPSHOT_IGNORED = new Set([...IGNORED_PATTERNS, '.cushion']);

export interface WalkedFile {
  relPath: string;
  absPath: string;
  size: number;
  mtimeMs: number;
}

export async function walkWorkspace(rootPath: string): Promise<WalkedFile[]> {
  const results: WalkedFile[] = [];

  const walk = async (dirAbs: string, relBase: string): Promise<void> => {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dirAbs, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (SNAPSHOT_IGNORED.has(entry.name)) continue;
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      const abs = path.join(dirAbs, entry.name);
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        let stat: import('fs').Stats;
        try {
          stat = await fs.stat(abs);
        } catch {
          continue;
        }
        results.push({
          relPath: rel,
          absPath: abs,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
        });
      }
    }
  };

  await walk(rootPath, '');
  return results;
}
