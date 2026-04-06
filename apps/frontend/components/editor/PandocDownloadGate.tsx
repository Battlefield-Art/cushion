import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, AlertCircle } from 'lucide-react';

interface PandocDownloadGateProps {
  onInstalled: () => void;
}

type GateState =
  | { phase: 'idle' }
  | { phase: 'downloading'; percent: number; downloadedBytes: number; totalBytes: number }
  | { phase: 'error'; message: string };

export function PandocDownloadGate({ onInstalled }: PandocDownloadGateProps) {
  const [state, setState] = useState<GateState>({ phase: 'idle' });

  useEffect(() => {
    const unsubs: (() => void)[] = [];

    unsubs.push(
      window.electronAPI.onCoordinatorNotification('pandoc/download-progress', (data: any) => {
        setState({
          phase: 'downloading',
          percent: data.percent,
          downloadedBytes: data.downloadedBytes,
          totalBytes: data.totalBytes,
        });
      }),
    );

    unsubs.push(
      window.electronAPI.onCoordinatorNotification('pandoc/download-complete', () => {
        onInstalled();
      }),
    );

    unsubs.push(
      window.electronAPI.onCoordinatorNotification('pandoc/download-error', (data: any) => {
        setState({ phase: 'error', message: data.error });
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [onInstalled]);

  const handleDownload = useCallback(async () => {
    setState({ phase: 'downloading', percent: 0, downloadedBytes: 0, totalBytes: 0 });
    try {
      await window.electronAPI.coordinatorInvoke('pandoc/ensure-binary', {});
    } catch {}
  }, []);

  const handleCancel = useCallback(async () => {
    await window.electronAPI.coordinatorInvoke('pandoc/cancel-download', {});
    setState({ phase: 'idle' });
  }, []);

  const handleRecheck = useCallback(async () => {
    const status = await window.electronAPI.coordinatorInvoke('pandoc/binary-status', {});
    if (status.available) onInstalled();
  }, [onInstalled]);

  if (state.phase === 'downloading') {
    const downloadedMb = (state.downloadedBytes / 1024 / 1024).toFixed(1);
    const totalMb = state.totalBytes > 0 ? (state.totalBytes / 1024 / 1024).toFixed(1) : '?';
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-foreground-muted">
          <span>Downloading Pandoc...</span>
          <span>{downloadedMb} / {totalMb} MB</span>
        </div>
        <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-200"
            style={{ width: `${state.percent}%` }}
          />
        </div>
        <button
          onClick={handleCancel}
          className="px-3 py-1.5 rounded text-sm cursor-pointer border border-modal-border bg-transparent text-foreground-muted hover:bg-[var(--overlay-10)] transition-all"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (state.phase === 'error') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-foreground-muted">
          <AlertCircle size={16} />
          <span>{state.message}</span>
        </div>
        <button
          onClick={handleDownload}
          className="px-3 py-1.5 rounded text-sm cursor-pointer border border-modal-border bg-transparent text-foreground-muted hover:bg-[var(--overlay-10)] transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-foreground-muted">
        <Download size={16} />
        <span>Advanced formats require Pandoc</span>
      </div>
      <p className="text-xs text-foreground-faint leading-relaxed">
        Pandoc is a free document converter (~35 MB download).
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={handleDownload}
          className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border-none bg-accent text-surface hover:bg-accent-hover transition-all"
        >
          Download
        </button>
        <button
          onClick={handleRecheck}
          className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm cursor-pointer border border-modal-border bg-transparent text-foreground-muted hover:bg-[var(--overlay-10)] transition-all"
        >
          <RefreshCw size={14} />
          I already have Pandoc
        </button>
      </div>
      <p className="text-[11px] text-foreground-faint">
        Pandoc by MacFarlane, Krewinkel &amp; Rosenthal — GPL-2.0
      </p>
    </div>
  );
}
