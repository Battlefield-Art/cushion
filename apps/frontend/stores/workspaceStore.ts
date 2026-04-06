import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import type {
  WorkspaceState,
  WorkspaceMetadata,
  FileState,
  TabState,
  WorkspacePreferences,
  Frontmatter,
  EditorPane,
} from '@cushion/types';
import type { CoordinatorClient } from '@/lib/coordinator-client';
import { DEFAULT_SETTINGS } from '@/lib/config-defaults';
import { parseFrontmatter } from '@/lib/frontmatter';

interface WorkspaceActions {
  setClient: (client: CoordinatorClient) => void;

  // Workspace lifecycle
  openWorkspace: (projectPath: string) => Promise<void>;
  selectWorkspaceFolder: () => Promise<string | null>;
  closeWorkspace: () => void;

  // File operations
  openFile: (filePath: string, content: string, forceNewTab?: boolean) => void;
  closeFile: (filePath: string) => void;
  updateFileContent: (filePath: string, content: string) => void;
  markFileSaved: (filePath: string, content: string) => void;
  replaceOpenFileContent: (filePath: string, content: string) => void;
  setCurrentFile: (filePath: string | null) => void;

  // Tab management
  addTab: (filePath: string, isPreview?: boolean, paneId?: string) => void;
  addNewTab: () => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  pinTab: (tabId: string) => void;
  convertPreviewTab: (filePath: string) => void;

  // Pane management
  splitPane: (filePath?: string | null) => void;
  closePane: (paneId: string) => void;
  setActivePane: (paneId: string) => void;
  setPaneSizes: (sizes: number[]) => void;
  moveTabToPane: (tabId: string, fromPaneId: string, toPaneId: string) => void;

  // Recent history
  addRecentProject: () => void;

  // Preferences
  updatePreferences: (preferences: Partial<WorkspacePreferences>) => void;

  // Layout
  setSidebarWidth: (width: number) => void;

  // Error handling
  setError: (error: string | null) => void;
  setLoading: (isLoading: boolean) => void;

  // File tree
  setFlatFileList: (paths: string[]) => void;

  // Utilities
  reset: () => void;
}

function createDefaultPane(tabs: TabState[] = [], activeFile: string | null = null): EditorPane {
  return {
    id: `pane-${Date.now()}-${Math.random()}`,
    tabs,
    activeFile,
  };
}

const defaultPane = createDefaultPane();

const initialState: Omit<WorkspaceState, keyof WorkspaceActions> & {
  panes: EditorPane[];
  activePaneId: string | null;
  paneSizes: number[];
} = {
  metadata: null,
  openFiles: new Map(),
  tabs: [],
  currentFile: null,
  panes: [defaultPane],
  activePaneId: defaultPane.id,
  paneSizes: [],
  flatFileList: [],
  fileWatcher: {
    watchedPaths: [],
    ignoredPatterns: [],
    hasExternalChanges: new Map(),
  },
  recentProjects: [],
  recentFiles: [],
  preferences: { ...DEFAULT_SETTINGS },
  sidebarWidth: 240,
  sessionId: '',
  isLoading: false,
  error: null,
};

let coordinatorClient: CoordinatorClient | null = null;

function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    md: 'markdown',
    json: 'json',
    html: 'html',
    css: 'css',
    py: 'python',
    java: 'java',
    go: 'go',
    rs: 'rust',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    sh: 'shell',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    txt: 'plaintext',
    log: 'plaintext',
    conf: 'plaintext',
    ini: 'plaintext',
    cfg: 'plaintext',
  };
  return languageMap[ext || ''] || 'plaintext';
}

function supportsFrontmatter(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ext === 'md' || ext === 'markdown';
}

function extractFrontmatter(filePath: string, content: string): Frontmatter | null {
  if (!supportsFrontmatter(filePath)) {
    return null;
  }

  const { frontmatter, errors } = parseFrontmatter(content);

  if (errors.length > 0) {
    console.warn('[WorkspaceStore] Frontmatter parsing warnings:', errors);
  }

  return frontmatter;
}

// Derive compat tabs/currentFile from the active pane
function deriveCompat(panes: EditorPane[], activePaneId: string | null) {
  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  return {
    tabs: activePane?.tabs ?? [],
    currentFile: activePane?.activeFile ?? null,
  };
}

// Find which pane owns a tab
function findPaneByTabId(panes: EditorPane[], tabId: string): EditorPane | undefined {
  return panes.find((p) => p.tabs.some((t) => t.id === tabId));
}

// Find which pane has a file open
function findPaneByFilePath(panes: EditorPane[], filePath: string): EditorPane | undefined {
  return panes.find((p) => p.tabs.some((t) => t.filePath === filePath));
}

type StoreState = WorkspaceState & WorkspaceActions & {
  panes: EditorPane[];
  activePaneId: string | null;
  paneSizes: number[];
};

export const useWorkspaceStore = create<StoreState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...initialState,

        setClient: (client: CoordinatorClient) => {
          coordinatorClient = client;
        },

        openWorkspace: async (projectPath: string) => {
          if (!coordinatorClient) {
            throw new Error('Coordinator client not initialized');
          }

          set({ isLoading: true, error: null });

          try {
            const previousProjectPath = get().metadata?.projectPath;
            const { projectName, gitRoot } = await coordinatorClient.openWorkspace(projectPath);

            const metadata: WorkspaceMetadata = {
              projectPath,
              projectName,
              lastOpened: Date.now(),
              gitRoot: gitRoot || undefined,
            };

            const isWorkspaceSwitch = previousProjectPath !== projectPath;

            if (isWorkspaceSwitch) {
              const freshPane = createDefaultPane();
              set((state) => ({
                metadata,
                isLoading: false,
                error: null,
                openFiles: new Map(),
                tabs: [],
                currentFile: null,
                panes: [freshPane],
                activePaneId: freshPane.id,
                paneSizes: [],
                flatFileList: [],
                fileWatcher: {
                  ...state.fileWatcher,
                  hasExternalChanges: new Map(),
                },
              }));
            } else {
              set({ metadata, isLoading: false, error: null });
            }

            get().addRecentProject();

            window.electronAPI.notifyWorkspaceOpened(projectPath);
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            set({
              error: errorMessage,
              isLoading: false,
            });
            console.error('[WorkspaceStore] Failed to open workspace:', error);
            throw error instanceof Error ? error : new Error(errorMessage);
          }
        },

        selectWorkspaceFolder: async () => {
          if (!coordinatorClient) {
            throw new Error('Coordinator client not initialized');
          }

          const { path } = await coordinatorClient.selectWorkspaceFolder();
          return path;
        },

        closeWorkspace: () => {
          const freshPane = createDefaultPane();
          set({
            ...initialState,
            panes: [freshPane],
            activePaneId: freshPane.id,
          });
        },

        openFile: (filePath: string, content: string, forceNewTab: boolean = false) => {
          const { metadata, openFiles, panes, activePaneId } = get();

          if (!metadata) {
            return;
          }

          // Check if any pane already has a tab for this file
          const existingPane = findPaneByFilePath(panes, filePath);
          if (existingPane) {
            const existingTab = existingPane.tabs.find((t) => t.filePath === filePath)!;
            get().setActiveTab(existingTab.id);

            if (!openFiles.get(filePath)) {
              const frontmatter = extractFrontmatter(filePath, content);
              const fileState: FileState = {
                filePath,
                absolutePath: `${metadata.projectPath}/${filePath}`,
                content,
                savedContent: content,
                isDirty: false,
                version: 1,
                language: detectLanguage(filePath),
                encoding: 'utf-8',
                lineEnding: 'LF',
                lastSaved: Date.now(),
                frontmatter,
              };
              const newOpenFiles = new Map(openFiles);
              newOpenFiles.set(filePath, fileState);
              set({ openFiles: newOpenFiles });
            }
            return;
          }

          const frontmatter = extractFrontmatter(filePath, content);

          const fileState: FileState = {
            filePath,
            absolutePath: `${metadata.projectPath}/${filePath}`,
            content,
            savedContent: content,
            isDirty: false,
            version: 1,
            language: detectLanguage(filePath),
            encoding: 'utf-8',
            lineEnding: 'LF',
            lastSaved: Date.now(),
            frontmatter,
          };

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.set(filePath, fileState);

          // Check for __new_tab__ placeholder in active pane
          const activePane = panes.find((p) => p.id === activePaneId);
          if (activePane) {
            const newTabPlaceholder = activePane.tabs.find((t) => t.filePath === '__new_tab__');
            if (newTabPlaceholder) {
              const newPanes = panes.map((p) => {
                if (p.id !== activePaneId) return p;
                return {
                  ...p,
                  tabs: p.tabs.map((t) =>
                    t.id === newTabPlaceholder.id
                      ? { ...t, filePath, isActive: true, isPreview: false }
                      : { ...t, isActive: false }
                  ),
                  activeFile: filePath,
                };
              });
              const compat = deriveCompat(newPanes, activePaneId);
              set({
                panes: newPanes,
                openFiles: newOpenFiles,
                ...compat,
              });
              return;
            }
          }

          get().addTab(filePath, false);

          set({
            openFiles: newOpenFiles,
            currentFile: filePath,
          });
        },

        closeFile: (filePath: string) => {
          const { openFiles, panes } = get();

          const newOpenFiles = new Map(openFiles);
          // Only remove from openFiles if no other pane has a tab for this file
          const paneWithFile = findPaneByFilePath(panes, filePath);
          const tab = paneWithFile?.tabs.find((t) => t.filePath === filePath);
          if (tab) {
            get().removeTab(tab.id);
          }

          // Check if any remaining pane still has this file open
          const { panes: updatedPanes } = get();
          const stillOpen = findPaneByFilePath(updatedPanes, filePath);
          if (!stillOpen) {
            newOpenFiles.delete(filePath);
            set({ openFiles: newOpenFiles });
          }
        },

        updateFileContent: (filePath: string, content: string) => {
          const { openFiles } = get();
          const file = openFiles.get(filePath);

          if (!file) {
            return;
          }

          const frontmatter = extractFrontmatter(filePath, content);

          const updatedFile: FileState = {
            ...file,
            content,
            version: file.version + 1,
            isDirty: content !== file.savedContent,
            frontmatter,
          };

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.set(filePath, updatedFile);

          set({ openFiles: newOpenFiles });

          const previewPane = get().panes.find((p) => p.tabs.some((t) => t.filePath === filePath && t.isPreview));
          if (previewPane) {
            get().convertPreviewTab(filePath);
          }
        },

        markFileSaved: (filePath: string, content: string) => {
          const { openFiles } = get();
          const file = openFiles.get(filePath);

          if (!file) return;

          const updatedFile: FileState = {
            ...file,
            savedContent: content,
            isDirty: file.content !== content,
            lastSaved: Date.now(),
          };

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.set(filePath, updatedFile);

          set({ openFiles: newOpenFiles });
        },

        replaceOpenFileContent: (filePath: string, content: string) => {
          const { openFiles } = get();
          const file = openFiles.get(filePath);
          if (!file) return;
          if (file.content === content && file.savedContent === content) return;

          const frontmatter = extractFrontmatter(filePath, content);
          const updatedFile: FileState = {
            ...file,
            content,
            savedContent: content,
            isDirty: false,
            version: file.version + 1,
            lastSaved: Date.now(),
            frontmatter,
          };

          const newOpenFiles = new Map(openFiles);
          newOpenFiles.set(filePath, updatedFile);
          set({ openFiles: newOpenFiles });
        },

        setCurrentFile: (filePath: string | null) => {
          const { panes, activePaneId } = get();
          const newPanes = panes.map((p) => {
            if (p.id !== activePaneId) return p;
            return { ...p, activeFile: filePath };
          });
          set({ panes: newPanes, currentFile: filePath });
        },

        addTab: (filePath: string, isPreview: boolean = false, paneId?: string) => {
          const { panes, activePaneId } = get();
          const targetPaneId = paneId || activePaneId;

          const newPanes = panes.map((p) => {
            if (p.id !== targetPaneId) return p;

            if (isPreview) {
              const previewTabIndex = p.tabs.findIndex((t) => t.isPreview);
              if (previewTabIndex !== -1) {
                return {
                  ...p,
                  tabs: p.tabs.map((t, i) =>
                    i === previewTabIndex
                      ? { ...t, filePath, isActive: true }
                      : { ...t, isActive: false }
                  ),
                  activeFile: filePath,
                };
              }
            }

            const newTab: TabState = {
              id: `tab-${Date.now()}-${Math.random()}`,
              filePath,
              isActive: true,
              isPinned: false,
              isPreview,
              order: p.tabs.length,
            };

            return {
              ...p,
              tabs: [...p.tabs.map((t) => ({ ...t, isActive: false })), newTab],
              activeFile: filePath,
            };
          });

          const compat = deriveCompat(newPanes, activePaneId);
          set({ panes: newPanes, ...compat });
        },

        addNewTab: () => {
          const { panes, activePaneId } = get();

          const newTab: TabState = {
            id: `tab-${Date.now()}-${Math.random()}`,
            filePath: '__new_tab__',
            isActive: true,
            isPinned: false,
            isPreview: false,
            order: 0,
          };

          const newPanes = panes.map((p) => {
            if (p.id !== activePaneId) return p;
            return {
              ...p,
              tabs: [...p.tabs.map((t) => ({ ...t, isActive: false })), { ...newTab, order: p.tabs.length }],
              activeFile: '__new_tab__',
            };
          });

          const compat = deriveCompat(newPanes, activePaneId);
          set({ panes: newPanes, ...compat });
        },

        removeTab: (tabId: string) => {
          const { panes, activePaneId } = get();
          const owningPane = findPaneByTabId(panes, tabId);
          if (!owningPane) return;

          const removedTab = owningPane.tabs.find((t) => t.id === tabId);
          const newTabs = owningPane.tabs.filter((t) => t.id !== tabId);

          let newActiveFile = owningPane.activeFile;
          if (removedTab?.filePath === owningPane.activeFile && newTabs.length > 0) {
            newTabs[0].isActive = true;
            newActiveFile = newTabs[0].filePath;
          } else if (newTabs.length === 0) {
            newActiveFile = null;
          }

          // If pane is now empty and there are multiple panes, auto-close it
          if (newTabs.length === 0 && panes.length > 1) {
            get().closePane(owningPane.id);
            return;
          }

          const newPanes = panes.map((p) => {
            if (p.id !== owningPane.id) return p;
            return { ...p, tabs: newTabs, activeFile: newActiveFile };
          });

          const compat = deriveCompat(newPanes, activePaneId);
          set({ panes: newPanes, ...compat });
        },

        setActiveTab: (tabId: string) => {
          const { panes } = get();
          const owningPane = findPaneByTabId(panes, tabId);
          if (!owningPane) return;

          const newPanes = panes.map((p) => {
            if (p.id !== owningPane.id) return p;
            const newTabs = p.tabs.map((t) => ({
              ...t,
              isActive: t.id === tabId,
            }));
            const activeTab = newTabs.find((t) => t.id === tabId);
            return {
              ...p,
              tabs: newTabs,
              activeFile: activeTab?.filePath ?? p.activeFile,
            };
          });

          set({
            panes: newPanes,
            activePaneId: owningPane.id,
            ...deriveCompat(newPanes, owningPane.id),
          });
        },

        pinTab: (tabId: string) => {
          const { panes, activePaneId } = get();
          const owningPane = findPaneByTabId(panes, tabId);
          if (!owningPane) return;

          const newPanes = panes.map((p) => {
            if (p.id !== owningPane.id) return p;
            return {
              ...p,
              tabs: p.tabs.map((t) =>
                t.id === tabId ? { ...t, isPinned: !t.isPinned } : t
              ),
            };
          });
          const compat = deriveCompat(newPanes, activePaneId);
          set({ panes: newPanes, ...compat });
        },

        convertPreviewTab: (filePath: string) => {
          const { panes, activePaneId } = get();
          const newPanes = panes.map((p) => ({
            ...p,
            tabs: p.tabs.map((t) =>
              t.filePath === filePath ? { ...t, isPreview: false } : t
            ),
          }));
          const compat = deriveCompat(newPanes, activePaneId);
          set({ panes: newPanes, ...compat });
        },

        // ---- Pane actions ----

        splitPane: (filePath?: string | null) => {
          const { panes, activePaneId } = get();
          const fileToOpen = filePath ?? get().currentFile;
          const newPane = createDefaultPane(
            fileToOpen
              ? [{
                  id: `tab-${Date.now()}-${Math.random()}`,
                  filePath: fileToOpen,
                  isActive: true,
                  isPinned: false,
                  isPreview: false,
                  order: 0,
                }]
              : [],
            fileToOpen ?? null,
          );

          const activeIndex = panes.findIndex((p) => p.id === activePaneId);
          const newPanes = [...panes];
          newPanes.splice(activeIndex + 1, 0, newPane);

          const compat = deriveCompat(newPanes, newPane.id);
          set({
            panes: newPanes,
            activePaneId: newPane.id,
            paneSizes: [],
            ...compat,
          });
        },

        closePane: (paneId: string) => {
          const { panes, activePaneId } = get();
          if (panes.length <= 1) return;

          const idx = panes.findIndex((p) => p.id === paneId);
          const newPanes = panes.filter((p) => p.id !== paneId);

          let newActivePaneId = activePaneId;
          if (activePaneId === paneId) {
            const neighborIdx = Math.min(idx, newPanes.length - 1);
            newActivePaneId = newPanes[neighborIdx].id;
          }

          // Clean up openFiles for files that are no longer in any pane
          const allOpenFilePaths = new Set(newPanes.flatMap((p) => p.tabs.map((t) => t.filePath)));
          const { openFiles } = get();
          const newOpenFiles = new Map(openFiles);
          for (const [fp] of openFiles) {
            if (!allOpenFilePaths.has(fp)) {
              newOpenFiles.delete(fp);
            }
          }

          const compat = deriveCompat(newPanes, newActivePaneId);
          set({
            panes: newPanes,
            activePaneId: newActivePaneId,
            paneSizes: [],
            openFiles: newOpenFiles,
            ...compat,
          });
        },

        setActivePane: (paneId: string) => {
          const { panes } = get();
          const pane = panes.find((p) => p.id === paneId);
          if (!pane) return;
          const compat = deriveCompat(panes, paneId);
          set({ activePaneId: paneId, ...compat });
        },

        setPaneSizes: (sizes: number[]) => {
          set({ paneSizes: sizes });
        },

        moveTabToPane: (tabId: string, fromPaneId: string, toPaneId: string) => {
          if (fromPaneId === toPaneId) return;
          const { panes, activePaneId } = get();

          const fromPane = panes.find((p) => p.id === fromPaneId);
          const toPane = panes.find((p) => p.id === toPaneId);
          if (!fromPane || !toPane) return;

          const tab = fromPane.tabs.find((t) => t.id === tabId);
          if (!tab) return;

          const fromTabs = fromPane.tabs.filter((t) => t.id !== tabId);
          const toTabs = [...toPane.tabs.map((t) => ({ ...t, isActive: false })), { ...tab, isActive: true, order: toPane.tabs.length }];

          let newFromActiveFile = fromPane.activeFile;
          if (tab.filePath === fromPane.activeFile && fromTabs.length > 0) {
            fromTabs[0].isActive = true;
            newFromActiveFile = fromTabs[0].filePath;
          } else if (fromTabs.length === 0) {
            newFromActiveFile = null;
          }

          let newPanes = panes.map((p) => {
            if (p.id === fromPaneId) return { ...p, tabs: fromTabs, activeFile: newFromActiveFile };
            if (p.id === toPaneId) return { ...p, tabs: toTabs, activeFile: tab.filePath };
            return p;
          });

          // Auto-close empty from-pane if multiple panes exist
          if (fromTabs.length === 0 && newPanes.length > 1) {
            newPanes = newPanes.filter((p) => p.id !== fromPaneId);
          }

          const newActivePaneId = toPaneId;
          const compat = deriveCompat(newPanes, newActivePaneId);
          set({ panes: newPanes, activePaneId: newActivePaneId, paneSizes: [], ...compat });
        },

        addRecentProject: () => {
          const { metadata } = get();
          if (!metadata) return;

          set((state) => {
            const filtered = state.recentProjects.filter(
              (p) => p.projectPath !== metadata.projectPath
            );

            return {
              recentProjects: [metadata, ...filtered].slice(0, 10),
            };
          });
        },

        updatePreferences: (preferences: Partial<WorkspacePreferences>) => {
          set((state) => ({
            preferences: {
              ...state.preferences,
              ...preferences,
            },
          }));
        },

        setSidebarWidth: (width: number) => {
          set({ sidebarWidth: width });
        },

        setError: (error: string | null) => {
          set({ error });
        },

        setLoading: (isLoading: boolean) => {
          set({ isLoading });
        },

        setFlatFileList: (paths: string[]) => {
          set({ flatFileList: paths });
        },

        reset: () => {
          const freshPane = createDefaultPane();
          set({
            ...initialState,
            panes: [freshPane],
            activePaneId: freshPane.id,
          });
        },
      }),
      {
        name: 'cushion-workspace',
        partialize: (state) => ({
          recentProjects: state.recentProjects,
        }),
      }
    )
  )
);
