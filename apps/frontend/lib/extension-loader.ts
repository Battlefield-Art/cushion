import React from 'react';
import { registerExternalExtensionView, unregisterExternalViews } from './view-registry';
import type { CoordinatorClient } from './coordinator-client';
import type { DiscoveredExtension, ExtensionsConfig } from '@cushion/types';

const blobUrls: string[] = [];

function createLazyExtension(
  client: CoordinatorClient,
  dirName: string,
) {
  return React.lazy(async () => {
    const { source } = await client.readExtensionSource(dirName);
    const stripped = source.replace(/^import\s+.*?\s+from\s+["']react["'];?\s*$/gm, '');
    const shimmed = [
      'const React = window.__CushionReact;',
      'const { useState, useEffect, useCallback, useMemo, useRef, useReducer, useContext, useLayoutEffect, memo, forwardRef, createContext, Fragment, createElement, cloneElement, isValidElement, Children } = React;',
      stripped,
    ].join('\n');

    const blob = new Blob([shimmed], { type: 'application/javascript' });
    const url = URL.createObjectURL(blob);
    blobUrls.push(url);

    const mod = await import(/* @vite-ignore */ url);
    return { default: mod.default };
  });
}

function registerDiscovered(
  client: CoordinatorClient,
  extensions: DiscoveredExtension[],
) {
  for (const { manifest, dirName } of extensions) {
    if (!manifest.main) {
      console.warn(`[Extensions] Skipping ${dirName}: no main entry point`);
      continue;
    }
    const allExts: string[] = [];
    let binary = false;
    for (const ft of manifest.fileTypes) {
      allExts.push(...ft.extensions);
      if (ft.binary) binary = true;
    }

    registerExternalExtensionView(manifest.id, {
      displayName: manifest.name,
      component: createLazyExtension(client, dirName),
      extensions: allExts,
      icon: manifest.icon,
      binary,
    });
  }
}

export async function readDisabledSet(client: CoordinatorClient): Promise<Set<string>> {
  try {
    const { content } = await client.readConfig('extensions.json');
    if (content) {
      const parsed: ExtensionsConfig = JSON.parse(content);
      if (Array.isArray(parsed.disabled)) {
        return new Set(parsed.disabled);
      }
    }
  } catch {}
  return new Set();
}

export async function loadGlobalExtensions(client: CoordinatorClient, hasWorkspace: boolean = false): Promise<Set<string>> {
  const disabled = hasWorkspace ? await readDisabledSet(client) : new Set<string>();
  const { extensions } = await client.discoverGlobalExtensions();
  const filtered = extensions.filter((ext) => !disabled.has(ext.manifest.id));
  registerDiscovered(client, filtered);
  return disabled;
}

export function unloadExternalExtensions(): void {
  unregisterExternalViews();
  for (const url of blobUrls) {
    URL.revokeObjectURL(url);
  }
  blobUrls.length = 0;
}
