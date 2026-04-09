import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatShortcutList, useShortcutBindings, useShortcutHandler } from '@/lib/shortcuts';
import type { ExtensionContext } from '@cushion/extension-api';

const IMAGE_SHORTCUT_IDS = ['image.zoom.in', 'image.zoom.out', 'image.reset'] as const;

const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
};

function getMimeType(filePath: string): string {
  const dot = filePath.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  const ext = filePath.slice(dot + 1).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}

export function ImageExtension({ ctx }: { ctx: ExtensionContext }) {
  const [base64, setBase64] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const imageShortcuts = useShortcutBindings(IMAGE_SHORTCUT_IDS);

  const mimeType = useMemo(() => getMimeType(ctx.filePath), [ctx.filePath]);
  const fileName = useMemo(() => ctx.filePath.split(/[/\\]/).pop() || ctx.filePath, [ctx.filePath]);

  // Load image on mount
  useEffect(() => {
    let cancelled = false;
    ctx.file.read().then((data) => {
      if (!cancelled) setBase64(data);
    }).catch((err) => {
      console.error('[ImageExtension] Failed to load image:', err);
    });
    return () => { cancelled = true; };
  }, [ctx.file]);

  // Reload on external change
  useEffect(() => {
    return ctx.file.onExternalChange((content) => {
      if (content === null) {
        ctx.file.read().then(setBase64).catch(() => {});
      }
    });
  }, [ctx.file]);

  const zoomIn = useCallback(() => setScale(s => Math.min(s * 1.25, 10)), []);
  const zoomOut = useCallback(() => setScale(s => Math.max(s / 1.25, 0.1)), []);
  const resetView = useCallback(() => { setScale(1); setPosition({ x: 0, y: 0 }); }, []);

  // Ctrl+Scroll zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setScale(s => Math.min(Math.max(s * factor, 0.1), 10));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Keyboard shortcuts — only active when this tab is visible
  const imageHandlers = useMemo(() => ({
    'image.zoom.in': () => { zoomIn(); },
    'image.zoom.out': () => { zoomOut(); },
    'image.reset': () => { resetView(); },
  } as const), [zoomIn, zoomOut, resetView]);

  useShortcutHandler({ handlers: imageHandlers, enabled: ctx.isActive });

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...position };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setPosition({
      x: posStart.current.x + (e.clientX - dragStart.current.x),
      y: posStart.current.y + (e.clientY - dragStart.current.y),
    });
  }, [dragging]);

  const onPointerUp = useCallback(() => setDragging(false), []);

  if (!base64) {
    return <div className="flex items-center justify-center h-full text-muted-foreground">Loading image…</div>;
  }

  const dataUri = `data:${mimeType};base64,${base64}`;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border/50 flex-shrink-0">
        <span className="text-sm text-muted-foreground truncate mr-auto">{fileName}</span>
        <button
          onClick={zoomOut}
          className={toolBtn}
          title={(() => {
            const label = formatShortcutList(imageShortcuts['image.zoom.out']);
            return label ? `Zoom out (${label})` : 'Zoom out';
          })()}
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-muted-foreground w-14 text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={zoomIn}
          className={toolBtn}
          title={(() => {
            const label = formatShortcutList(imageShortcuts['image.zoom.in']);
            return label ? `Zoom in (${label})` : 'Zoom in';
          })()}
        >
          <ZoomIn size={16} />
        </button>
        <button
          onClick={resetView}
          className={toolBtn}
          title={(() => {
            const label = formatShortcutList(imageShortcuts['image.reset']);
            return label ? `Reset (${label})` : 'Reset';
          })()}
        >
          <RotateCcw size={16} />
        </button>
      </div>

      <div
        ref={containerRef}
        className={cn(
          "flex-1 min-h-0 overflow-hidden flex items-center justify-center",
          "bg-[var(--md-bg,var(--background))]",
          dragging ? "cursor-grabbing" : "cursor-grab"
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <img
          src={dataUri}
          alt={fileName}
          draggable={false}
          className="select-none"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            maxWidth: scale <= 1 ? '90%' : undefined,
            maxHeight: scale <= 1 ? '90%' : undefined,
            objectFit: 'contain',
          }}
        />
      </div>
    </div>
  );
}

const toolBtn = cn(
  "h-7 w-7 rounded flex items-center justify-center",
  "text-muted-foreground hover:text-foreground",
  "hover:bg-muted/40",
  "transition-colors duration-150"
);
