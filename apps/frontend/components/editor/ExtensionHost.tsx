import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import type { ExtensionContext, ExtensionDimensions } from '@cushion/extension-api';
import { getSharedCoordinatorClient } from '@/lib/shared-coordinator-client';
import { useAppearanceStore } from '@/stores/appearanceStore';
import { ExtensionErrorBoundary } from './ExtensionErrorBoundary';

interface ExtensionHostProps {
  filePath: string;
  component: ComponentType<{ ctx: ExtensionContext }>;
  binary?: boolean;
  isActive?: boolean;
}

export function ExtensionHost({ filePath, component: Component, binary, isActive = false }: ExtensionHostProps) {
  const theme = useAppearanceStore((s) => s.resolvedTheme);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState<ExtensionDimensions>({ width: 0, height: 0 });

  const pendingRef = useRef<string | null>(null);
  const pendingBinaryRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastWrittenRef = useRef<string | null>(null);
  const filePathRef = useRef(filePath);
  const externalChangeCallbacksRef = useRef<Set<(content: string | null) => void>>(new Set());

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  // -- Dimensions via ResizeObserver --
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver((entries) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const entry = entries[0];
        if (entry) {
          setDimensions({
            width: entry.contentRect.width,
            height: entry.contentRect.height,
          });
        }
      }, 100);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // -- Save pipeline --
  const flush = useCallback(async () => {
    const content = pendingRef.current;
    if (content === null) return;
    pendingRef.current = null;

    try {
      const client = await getSharedCoordinatorClient();
      const fp = filePathRef.current;
      if (pendingBinaryRef.current) {
        await client.saveFileBase64(fp, content);
      } else {
        await client.saveFile(fp, content);
      }
      lastWrittenRef.current = content;
      pendingBinaryRef.current = false;
    } catch (err) {
      console.error('[ExtensionHost] Save failed:', err);
    }
  }, []);

  const update = useCallback((content: string) => {
    pendingRef.current = content;
    pendingBinaryRef.current = false;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, 1000);
  }, [flush]);

  const updateBase64 = useCallback((base64: string) => {
    pendingRef.current = base64;
    pendingBinaryRef.current = true;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flush, 1000);
  }, [flush]);

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      if (pendingRef.current !== null) {
        flush();
      }
    };
  }, [flush]);

  // -- Skip-own-write: watch for external file changes --
  useEffect(() => {
    let unsubDisk: (() => void) | undefined;
    let unsubFiles: (() => void) | undefined;

    const reload = async () => {
      try {
        const client = await getSharedCoordinatorClient();
        const fp = filePathRef.current;
        if (binary) {
          // Binary extensions get null — they should call read() themselves
          for (const cb of externalChangeCallbacksRef.current) {
            cb(null);
          }
        } else {
          const content = (await client.readFile(fp)).content;
          if (content === lastWrittenRef.current) return;
          for (const cb of externalChangeCallbacksRef.current) {
            cb(content);
          }
        }
      } catch {
        // File may have been deleted
      }
    };

    getSharedCoordinatorClient().then((client) => {
      unsubDisk = client.onFileChangedOnDisk((changedPath) => {
        if (changedPath !== filePath) return;
        reload();
      });

      unsubFiles = client.onFilesChanged((changes) => {
        if (!changes.some((c) => c.path === filePath)) return;
        reload();
      });
    });

    return () => {
      unsubDisk?.();
      unsubFiles?.();
    };
  }, [filePath, binary]);

  // -- Ctrl+S handler --
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        flush();
      }
    };
    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [flush]);

  // -- Build context (file API memoized separately for reference stability) --
  const onExternalChange = useCallback((callback: (content: string | null) => void) => {
    externalChangeCallbacksRef.current.add(callback);
    return () => {
      externalChangeCallbacksRef.current.delete(callback);
    };
  }, []);

  const fileApi = useMemo(() => ({
    async read() {
      const client = await getSharedCoordinatorClient();
      if (binary) {
        const result = await client.readFileBase64(filePath);
        return result.base64;
      }
      const result = await client.readFile(filePath);
      return result.content;
    },
    async readChunk(offset: number, length: number) {
      const client = await getSharedCoordinatorClient();
      return client.readFileBase64Chunk(filePath, offset, length);
    },
    update,
    updateBase64,
    flush,
    onExternalChange,
    async readOther(workspacePath: string) {
      const client = await getSharedCoordinatorClient();
      const result = await client.readFile(workspacePath);
      return result.content;
    },
    async readOtherBase64(workspacePath: string) {
      const client = await getSharedCoordinatorClient();
      return client.readFileBase64(workspacePath);
    },
  }), [filePath, binary, update, updateBase64, flush, onExternalChange]);

  const ctx = useMemo<ExtensionContext>(() => ({
    filePath,
    theme,
    dimensions,
    file: fileApi,
    isActive,
  }), [filePath, theme, dimensions, fileApi, isActive]);

  // -- CSS variable pass-through --
  const containerStyle = useMemo(() => ({
    height: '100%',
    minWidth: 0,
    '--ext-background': 'var(--background)',
    '--ext-foreground': 'var(--foreground)',
    '--ext-accent-primary': 'var(--accent-primary)',
    '--ext-border': 'var(--border)',
    '--ext-muted': 'var(--muted)',
    '--ext-muted-foreground': 'var(--muted-foreground)',
  } as React.CSSProperties), []);

  return (
    <div ref={containerRef} className="overflow-x-hidden" style={containerStyle}>
      <ExtensionErrorBoundary filePath={filePath}>
        <Suspense fallback={
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Loading extension…
          </div>
        }>
          <Component ctx={ctx} />
        </Suspense>
      </ExtensionErrorBoundary>
    </div>
  );
}
