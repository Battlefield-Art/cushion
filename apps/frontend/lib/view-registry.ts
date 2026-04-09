import type { ComponentType } from 'react';
import type { ExtensionContext, ExtensionManifest } from '@cushion/extension-api';

interface ViewRegistrationBase {
  id: string;
  displayName: string;
  extensions: string[];
  binary?: boolean;
}

export interface BundledViewRegistration extends ViewRegistrationBase {
  source: 'bundled';
  component: ComponentType<{ ctx: ExtensionContext }>;
}

export interface ExtensionViewRegistration extends ViewRegistrationBase {
  source: 'extension';
  component: ComponentType<{ ctx: ExtensionContext }>;
}

export type ViewRegistration = BundledViewRegistration | ExtensionViewRegistration;

const viewsById = new Map<string, ViewRegistration>();
const extensionIndex = new Map<string, string>();
const binaryExtensions = new Set<string>();
const externalIds = new Set<string>();

const BUILTIN_BINARY_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico', 'pdf'];
for (const ext of BUILTIN_BINARY_EXTS) {
  binaryExtensions.add(ext);
}

function normalizeExt(ext: string): string {
  return ext.replace(/^\./, '').toLowerCase();
}

export function registerBundledView(
  manifest: ExtensionManifest,
  component: ComponentType<{ ctx: ExtensionContext }>,
): void {
  const allExts = manifest.fileTypes.flatMap((ft) => ft.extensions);
  const isBinary = manifest.fileTypes.some((ft) => ft.binary);
  const registration: BundledViewRegistration = {
    id: manifest.id,
    source: 'bundled',
    displayName: manifest.name,
    component,
    extensions: allExts,
    binary: isBinary || undefined,
  };
  viewsById.set(manifest.id, registration);
  for (const ext of allExts) {
    const norm = normalizeExt(ext);
    extensionIndex.set(norm, manifest.id);
    if (isBinary) binaryExtensions.add(norm);
  }
}

export function registerExtensionView(
  id: string,
  config: { displayName: string; component: ComponentType<{ ctx: ExtensionContext }>; extensions: string[]; binary?: boolean },
): void {
  const registration: ExtensionViewRegistration = { id, source: 'extension', ...config };
  viewsById.set(id, registration);
  for (const ext of config.extensions) {
    const norm = normalizeExt(ext);
    extensionIndex.set(norm, id);
    if (config.binary) binaryExtensions.add(norm);
  }
}

export function registerExternalExtensionView(
  id: string,
  config: { displayName: string; component: ComponentType<{ ctx: ExtensionContext }>; extensions: string[]; icon?: string; binary?: boolean },
): void {
  registerExtensionView(id, config);
  externalIds.add(id);
}

export function unregisterView(id: string): void {
  viewsById.delete(id);
  for (const [ext, viewId] of extensionIndex) {
    if (viewId === id) {
      extensionIndex.delete(ext);
      if (!BUILTIN_BINARY_EXTS.includes(ext)) binaryExtensions.delete(ext);
    }
  }
}

export function unregisterExternalViews(): void {
  for (const id of externalIds) {
    unregisterView(id);
  }
  externalIds.clear();
}

export function getViewForFile(filePath: string): ViewRegistration | null {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return null;
  const ext = filePath.slice(dot + 1).toLowerCase();
  const id = extensionIndex.get(ext);
  if (!id) return null;
  return viewsById.get(id) ?? null;
}

export function isBinaryFile(filePath: string): boolean {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = filePath.slice(dot + 1).toLowerCase();
  return binaryExtensions.has(ext);
}
