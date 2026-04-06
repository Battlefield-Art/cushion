
import { Minus, Square, X, PanelLeft, PanelRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasCustomTitlebar, needsCustomWindowControls, noDragStyle } from './editor-path';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { PaneTabBar } from './PaneTabBar';
import logoSvg from '/logo.svg?url';

interface EditorTabRowProps {
  sidebarOpen?: boolean;
  sidebarWidth?: number;
  onToggleSidebar?: () => void;
  onOpenWorkspace?: () => void;
  rightPanelOpen?: boolean;
  rightPanelWidth?: number;
  onToggleRightPanel?: () => void;
}

export function EditorTabRow({
  sidebarOpen,
  sidebarWidth,
  onToggleSidebar,
  onOpenWorkspace,
  rightPanelOpen,
  rightPanelWidth,
  onToggleRightPanel,
}: EditorTabRowProps) {
  const panes = useWorkspaceStore((s) => s.panes);
  const paneSizes = useWorkspaceStore((s) => s.paneSizes);
  const hasSizes = paneSizes.length === panes.length;

  return (
    <div
      className={cn(
        'relative flex items-center bg-tab-container min-h-[40px] flex-shrink-0',
        "after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-border after:content-['']",
        hasCustomTitlebar && 'select-none'
      )}
      style={hasCustomTitlebar ? {
        WebkitAppRegion: 'drag',
      } as React.CSSProperties : undefined}
    >
      <div
        className={cn(
          'flex items-center self-center flex-shrink-0 transition-[width] duration-300 ease-in-out',
          sidebarOpen && 'border-r border-border'
        )}
        style={{ width: sidebarOpen ? sidebarWidth : undefined }}
      >
        {onOpenWorkspace && (
          <button
            onClick={onOpenWorkspace}
            className={cn(
              'ml-2 h-8 w-8 rounded-md flex-shrink-0 flex items-center justify-center overflow-visible',
              'hover:bg-muted/30',
              'transition-colors duration-150'
            )}
            style={noDragStyle}
            title="Open workspace"
            aria-label="Open workspace"
          >
            <img src={logoSvg} alt="Cushion" className="h-7 w-7" />
          </button>
        )}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className={cn(
              'ml-1 mr-auto h-7 w-7 rounded-md flex-shrink-0 flex items-center justify-center',
              sidebarOpen ? 'text-foreground' : 'text-muted-foreground',
              'hover:text-foreground',
              'hover:bg-muted/30',
              'transition-colors duration-150'
            )}
            style={noDragStyle}
            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
            aria-pressed={!!sidebarOpen}
          >
            <PanelLeft size={18} strokeWidth={1.75} />
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1 flex items-end">
        {panes.map((pane, i) => (
          <div
            key={pane.id}
            className="min-w-0"
            style={{ flex: hasSizes ? paneSizes[i] : 1 }}
          >
            <PaneTabBar paneId={pane.id} tabs={pane.tabs} />
          </div>
        ))}
      </div>

      <div
        className={cn(
          'flex-shrink-0 self-stretch transition-[margin] duration-300 ease-in-out',
          rightPanelOpen && 'border-l border-border'
        )}
        style={{
          width: rightPanelWidth ?? 0,
          marginRight: rightPanelOpen ? 0 : -(rightPanelWidth ?? 0),
        }}
      />

      {onToggleRightPanel && (
        <button
          onClick={onToggleRightPanel}
          className={cn(
            'absolute top-1/2 -translate-y-1/2 z-10 h-7 w-7 flex-shrink-0 flex items-center justify-center rounded-md',
            rightPanelOpen ? 'text-foreground' : 'text-muted-foreground',
            'hover:text-foreground',
            'hover:bg-muted/30',
            'transition-colors duration-150'
          )}
          style={{ ...noDragStyle, right: rightPanelOpen ? (rightPanelWidth ?? 0) - 36 : 140 }}
          title={rightPanelOpen ? 'Close right sidebar' : 'Open right sidebar'}
          aria-label={rightPanelOpen ? 'Close right sidebar' : 'Open right sidebar'}
          aria-pressed={!!rightPanelOpen}
        >
          <PanelRight size={18} strokeWidth={1.75} />
        </button>
      )}

      {needsCustomWindowControls && (
        <div className="flex items-center flex-shrink-0 ml-auto" style={noDragStyle}>
          <button
            onClick={() => window.electronAPI.windowMinimize()}
            className="h-10 w-12 flex items-center justify-center text-muted-foreground hover:bg-muted/30 transition-colors"
            aria-label="Minimize"
          >
            <Minus size={16} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => window.electronAPI.windowMaximize()}
            className="h-10 w-12 flex items-center justify-center text-muted-foreground hover:bg-muted/30 transition-colors"
            aria-label="Maximize"
          >
            <Square size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => window.electronAPI.windowClose()}
            className="h-10 w-12 flex items-center justify-center text-muted-foreground hover:text-white hover:bg-red-500 transition-colors"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
