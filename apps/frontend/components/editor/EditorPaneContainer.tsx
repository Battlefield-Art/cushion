import { Allotment } from 'allotment';
import 'allotment/dist/style.css';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { EditorPane } from './EditorPane';
import type { CoordinatorClient } from '@/lib/coordinator-client';

interface EditorPaneContainerProps {
  client: CoordinatorClient;
  onFileRenamed?: () => void;
  filePaths?: string[];
  focusModeEnabled?: boolean;
  onToggleFocusMode?: () => void;
  onNewNote?: () => void;
  onGoToFile?: () => void;
  onAddSelectionToChat?: (data: { path: string; selection: { startLine: number; startChar: number; endLine: number; endChar: number }; preview: string }) => void;
}

export function EditorPaneContainer({
  client,
  onFileRenamed,
  filePaths,
  focusModeEnabled,
  onToggleFocusMode,
  onNewNote,
  onGoToFile,
  onAddSelectionToChat,
}: EditorPaneContainerProps) {
  const panes = useWorkspaceStore((s) => s.panes);
  const paneSizes = useWorkspaceStore((s) => s.paneSizes);
  const setPaneSizes = useWorkspaceStore((s) => s.setPaneSizes);

  return (
    <div className="flex flex-col w-full h-full">
      <Allotment
        onChange={setPaneSizes}
        defaultSizes={paneSizes.length === panes.length ? paneSizes : undefined}
      >
        {panes.map((pane, i) => (
          <Allotment.Pane key={pane.id} minSize={200}>
            <EditorPane
              paneId={pane.id}
              isFirstPane={i === 0}
              client={client}
              onFileRenamed={onFileRenamed}
              filePaths={filePaths}
              focusModeEnabled={focusModeEnabled}
              onToggleFocusMode={onToggleFocusMode}
              onNewNote={onNewNote}
              onGoToFile={onGoToFile}
              onAddSelectionToChat={onAddSelectionToChat}
            />
          </Allotment.Pane>
        ))}
      </Allotment>
    </div>
  );
}
