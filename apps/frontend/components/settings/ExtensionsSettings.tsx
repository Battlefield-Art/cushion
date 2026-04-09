import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { readDisabledSet, loadGlobalExtensions, unloadExternalExtensions } from '@/lib/extension-loader';
import { registerBuiltinViews } from '@/lib/register-builtin-views';
import { cn } from '@/lib/utils';
import { VisibilityToggle } from '@/components/chat/CustomizeDialog';
import imageManifest from '@extensions/cushion-image/cushion-extension.json';
import pdfManifest from '@extensions/cushion-pdf/cushion-extension.json';
import excalidrawManifest from '@extensions/cushion-excalidraw/cushion-extension.json';
import type { ExtensionManifest } from '@cushion/extension-api';
import type { DiscoveredExtension } from '@cushion/types';

type ExtensionItem = {
  id: string;
  name: string;
  version: string;
  description?: string;
  fileTypes: string[];
  source: 'bundled' | 'external';
};

const bundledManifests: ExtensionManifest[] = [
  imageManifest as ExtensionManifest,
  pdfManifest as ExtensionManifest,
  excalidrawManifest as ExtensionManifest,
];

function manifestToItem(manifest: ExtensionManifest, source: 'bundled' | 'external'): ExtensionItem {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    fileTypes: manifest.fileTypes.flatMap((ft) => ft.extensions),
    source,
  };
}

export function ExtensionsSettings() {
  const hasWorkspace = useWorkspaceStore((s) => !!s.metadata?.projectPath);
  const [extensions, setExtensions] = useState<ExtensionItem[]>([]);
  const [disabled, setDisabled] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const client = await getSharedCoordinatorClient();

      const items: ExtensionItem[] = bundledManifests.map((m) => manifestToItem(m, 'bundled'));

      try {
        const { extensions: discovered } = await client.discoverGlobalExtensions();
        for (const ext of discovered as DiscoveredExtension[]) {
          if (!items.some((i) => i.id === ext.manifest.id)) {
            items.push(manifestToItem(ext.manifest, 'external'));
          }
        }
      } catch {}

      let disabledSet = new Set<string>();
      if (hasWorkspace) {
        try {
          disabledSet = await readDisabledSet(client);
        } catch {}
      }

      if (!cancelled) {
        setExtensions(items);
        setDisabled(disabledSet);
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [hasWorkspace]);

  const handleToggle = async (id: string, enable: boolean) => {
    const next = new Set(disabled);
    if (enable) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setDisabled(next);

    const client = await getSharedCoordinatorClient();
    await client.writeConfig('extensions.json', JSON.stringify({ disabled: [...next] }, null, 2));

    unloadExternalExtensions();
    await loadGlobalExtensions(client, hasWorkspace);
    registerBuiltinViews(next);
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return extensions;
    return extensions.filter((ext) => {
      const haystack = `${ext.name} ${ext.description ?? ''} ${ext.fileTypes.join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [extensions, searchQuery]);

  const enabledCount = extensions.filter((e) => !disabled.has(e.id)).length;

  if (!hasWorkspace) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Open a workspace to manage extensions
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3">
        <div className="flex h-8 items-center gap-2 rounded-md bg-surface px-2">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search extensions"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-full w-full border-none bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            autoFocus
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
        {loading ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">Loading extensions...</div>
        ) : filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            {searchQuery ? 'No matching extensions' : 'No extensions available'}
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((ext) => {
              const isEnabled = !disabled.has(ext.id);
              const label = `${isEnabled ? 'Disable' : 'Enable'} ${ext.name}`;

              return (
                <div
                  key={ext.id}
                  className="flex w-full cursor-pointer items-center gap-4 rounded-md px-2 py-1.5 transition-colors hover:bg-[var(--overlay-10)]"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleToggle(ext.id, !isEnabled)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    handleToggle(ext.id, !isEnabled);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] text-foreground">{ext.name}</span>
                      <span className="text-[11px] text-muted-foreground">{ext.version}</span>
                      <span className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] leading-none',
                        ext.source === 'bundled'
                          ? 'bg-[var(--overlay-10)] text-muted-foreground'
                          : 'bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]',
                      )}>
                        {ext.source === 'bundled' ? 'Bundled' : 'External'}
                      </span>
                    </div>
                    {ext.description && (
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {ext.description}
                      </span>
                    )}
                    <span className="block truncate text-[12px] text-muted-foreground/70">
                      {ext.fileTypes.join(', ')}
                    </span>
                  </div>
                  <div className="flex w-9 shrink-0 justify-end">
                    <VisibilityToggle
                      checked={isEnabled}
                      label={label}
                      onChange={(next) => handleToggle(ext.id, next)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!loading && extensions.length > 0 && (
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
          {enabledCount} of {extensions.length} extensions enabled
        </div>
      )}
    </div>
  );
}
