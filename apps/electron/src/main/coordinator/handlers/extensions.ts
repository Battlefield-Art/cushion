import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { parseManifest } from '@cushion/extension-api';
import type { DiscoveredExtension } from '@cushion/types';

const MAX_SOURCE_BYTES = 5 * 1024 * 1024;

async function discoverExtensionsInDir(
  dir: string,
): Promise<DiscoveredExtension[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: DiscoveredExtension[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const manifestPath = path.join(dir, entry.name, 'cushion-extension.json');
      const raw = await fs.readFile(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const manifest = parseManifest(parsed);
      if (!manifest) {
        console.warn(`[Extensions] Invalid manifest in ${entry.name}`);
        continue;
      }
      results.push({ manifest, dirName: entry.name });
    } catch {
      console.warn(`[Extensions] Skipping ${entry.name}: no valid manifest`);
    }
  }

  return results;
}

function resolveExtensionDir(dirName: string): string {
  const safe = path.basename(dirName);
  return path.join(os.homedir(), '.cushion', 'extensions', safe);
}

export async function handleDiscoverGlobal(): Promise<{ extensions: DiscoveredExtension[] }> {
  const dir = path.join(os.homedir(), '.cushion', 'extensions');
  const extensions = await discoverExtensionsInDir(dir);
  return { extensions };
}

export async function handleReadSource(
  params: { dirName: string },
): Promise<{ source: string }> {
  const extDir = resolveExtensionDir(params.dirName);

  const manifestPath = path.join(extDir, 'cushion-extension.json');
  const raw = await fs.readFile(manifestPath, 'utf-8');
  const manifest = parseManifest(JSON.parse(raw));
  if (!manifest) throw new Error(`Invalid manifest for ${params.dirName}`);

  if (!manifest.main) throw new Error(`Extension ${params.dirName} has no main entry point`);
  const mainPath = path.join(extDir, manifest.main);
  const stat = await fs.stat(mainPath);
  if (stat.size > MAX_SOURCE_BYTES) {
    throw new Error(`Extension source exceeds 5MB limit (${params.dirName})`);
  }

  const source = await fs.readFile(mainPath, 'utf-8');
  return { source };
}

export async function handleReadIcon(
  params: { dirName: string },
): Promise<{ svg: string | null }> {
  const extDir = resolveExtensionDir(params.dirName);

  const manifestPath = path.join(extDir, 'cushion-extension.json');
  try {
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const manifest = parseManifest(JSON.parse(raw));
    if (!manifest?.icon) return { svg: null };

    const iconPath = path.join(extDir, manifest.icon);
    const svg = await fs.readFile(iconPath, 'utf-8');
    return { svg };
  } catch {
    return { svg: null };
  }
}
