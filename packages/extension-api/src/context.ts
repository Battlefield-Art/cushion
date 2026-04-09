export interface ExtensionDimensions {
  width: number;
  height: number;
}

export interface ChunkResult {
  base64: string;
  mimeType: string;
  offset: number;
  bytesRead: number;
  totalBytes: number;
}

export interface ExtensionFileAPI {
  /** Read the extension's own file (text or base64 depending on binary flag). */
  read(): Promise<string>;
  /** Read a chunk of the file as base64. */
  readChunk(offset: number, length: number): Promise<ChunkResult>;
  /** Tell Cushion the content changed. Cushion handles debouncing and writing to disk. */
  update(content: string): void;
  /** Same as update() but for binary content (base64-encoded). */
  updateBase64(base64: string): void;
  /** Flush any pending writes immediately (for explicit save scenarios). */
  flush(): Promise<void>;
  /** Subscribe to external file changes. Text extensions get content, binary get null. */
  onExternalChange(callback: (content: string | null) => void): () => void;
  /** Read another file (text) by workspace-relative path. */
  readOther(workspacePath: string): Promise<string>;
  /** Read another file (base64) by workspace-relative path. */
  readOtherBase64(workspacePath: string): Promise<{ base64: string; mimeType: string }>;
}

export interface ExtensionContext {
  /** Absolute workspace-relative path to the file being viewed. */
  filePath: string;
  /** File API for reading, writing, and watching the current file. */
  file: ExtensionFileAPI;
  /** Current resolved theme ('light' or 'dark'). */
  theme: 'light' | 'dark';
  /** Container dimensions, updated via ResizeObserver. */
  dimensions: ExtensionDimensions;
  /** Whether this extension's tab is currently active/visible. */
  isActive: boolean;
}
