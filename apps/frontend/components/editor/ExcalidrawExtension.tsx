import { useState, useRef, useCallback, useEffect } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { ExtensionContext } from '@cushion/extension-api';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

if (typeof window !== 'undefined') {
  (window as any).EXCALIDRAW_ASSET_PATH = `${import.meta.env.BASE_URL}excalidraw-assets/`;
}

const DEFAULT_SCENE = {
  type: 'excalidraw' as const,
  version: 2,
  source: 'cushion',
  elements: [],
  appState: {},
  files: {},
};

const VOLATILE_APP_STATE_KEYS = new Set([
  'collaborators',
  'cursorButton',
  'selectedElementIds',
  'selectedGroupIds',
  'editingGroupId',
  'editingLinearElement',
  'editingElement',
  'draggingElement',
  'resizingElement',
  'selectionElement',
  'isResizing',
  'isRotating',
  'openMenu',
  'openPopup',
  'openSidebar',
  'lastPointerDownWith',
  'previousSelectedElementIds',
]);

export function ExcalidrawExtension({ ctx }: { ctx: ExtensionContext }) {
  const [initialData, setInitialData] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInitialData(null);
    setError(null);

    ctx.file.read()
      .then((content) => {
        if (cancelled) return;
        if (!content || !content.trim()) {
          setInitialData(DEFAULT_SCENE);
          return;
        }
        try {
          const parsed = JSON.parse(content);
          setInitialData(parsed);
        } catch {
          setInitialData(DEFAULT_SCENE);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(`Failed to load file: ${err.message}`);
      });

    return () => { cancelled = true; };
  }, [ctx.file]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        {error}
      </div>
    );
  }

  if (!initialData) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Loading…
      </div>
    );
  }

  return <ExcalidrawCanvas ctx={ctx} initialData={initialData} />;
}

interface ExcalidrawCanvasProps {
  ctx: ExtensionContext;
  initialData: Record<string, any>;
}

function ExcalidrawCanvas({ ctx, initialData }: ExcalidrawCanvasProps) {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const elementsRef = useRef<any[]>(initialData.elements ?? []);
  const appStateRef = useRef<Record<string, any>>(initialData.appState ?? {});
  const filesRef = useRef<Record<string, any>>(initialData.files ?? {});
  const mountedRef = useRef(false);

  const buildJson = useCallback(() => {
    const cleanAppState: Record<string, any> = {};
    for (const [key, value] of Object.entries(appStateRef.current)) {
      if (!VOLATILE_APP_STATE_KEYS.has(key)) {
        cleanAppState[key] = value;
      }
    }
    return JSON.stringify({
      type: 'excalidraw',
      version: 2,
      source: 'cushion',
      elements: elementsRef.current,
      appState: cleanAppState,
      files: filesRef.current,
    }, null, 2);
  }, []);

  // Watch for external changes
  useEffect(() => {
    return ctx.file.onExternalChange((content) => {
      if (!content?.trim()) return;
      try {
        const parsed = JSON.parse(content);
        const api = apiRef.current;
        if (api) {
          api.updateScene({ elements: parsed.elements ?? [] });
          elementsRef.current = parsed.elements ?? [];
          filesRef.current = parsed.files ?? {};
        }
      } catch {
        // Invalid JSON — ignore
      }
    });
  }, [ctx.file]);

  const handleChange = useCallback(
    (elements: readonly any[], appState: Record<string, any>, files: any) => {
      elementsRef.current = elements as any[];
      appStateRef.current = appState;
      filesRef.current = files ?? {};

      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }

      ctx.file.update(buildJson());
    },
    [ctx.file, buildJson],
  );

  return (
    <div className="w-full h-full min-w-0 overflow-hidden">
      <Excalidraw
        excalidrawAPI={(api) => { apiRef.current = api; }}
        initialData={{
          elements: initialData.elements,
          appState: initialData.appState,
          files: initialData.files,
        }}
        onChange={handleChange}
        theme={ctx.theme}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
            saveAsImage: false,
          },
        }}
      />
    </div>
  );
}
