export interface CushionSettings {
  readableLineLength?: boolean;
  showLineNumber?: boolean;
  spellcheck?: boolean;
  autoSave?: boolean;
  autoSaveDelay?: number;
  autoPairBrackets?: boolean;
  foldHeading?: boolean;
  foldIndent?: boolean;
  showHiddenFiles?: boolean;
  showCushionFiles?: boolean;
  fileSortOrder?: 'alphabetical' | 'modified' | 'created';
  respectGitignore?: boolean;
  allowedExtensions?: string[];
  trashMethod?: 'cushion' | 'system';
  confirmSystemTrash?: boolean;
}

export interface CushionAppearance {
  theme?: 'light' | 'dark' | 'system';
  accentColor?: string;
  baseFontSize?: number;
  textFontFamily?: string;
  monospaceFontFamily?: string;
  interfaceFontFamily?: string;
}

export interface CushionWorkspace {
  tabs?: Array<{
    id: string;
    filePath: string;
    isPinned: boolean;
    isPreview: boolean;
    order: number;
  }>;
  activeTab?: string | null;
  panes?: Array<{
    id: string;
    tabs: Array<{
      id: string;
      filePath: string;
      isPinned: boolean;
      isPreview: boolean;
      order: number;
    }>;
    activeFile: string | null;
  }>;
  activePaneId?: string | null;
  paneSizes?: number[];
  rightPanel?: {
    mode: 'chat' | 'none';
    width: number;
  };
  lastOpenFiles?: string[];
  sidebarWidth?: number;
}

export interface CushionChat {
  baseUrl?: string;
  selectedModel?: { providerID: string; modelID: string } | null;
  selectedAgent?: string | null;
  selectedVariant?: string | null;
  displayPreferences?: {
    showThinking: boolean;
    shellToolPartsExpanded: boolean;
    editToolPartsExpanded: boolean;
  };
  modelVisibility?: Record<string, 'show' | 'hide'>;
}
