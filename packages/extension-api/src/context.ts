export interface ChunkResult {
  base64: string;
  mimeType: string;
  offset: number;
  bytesRead: number;
  totalBytes: number;
}

export interface ExtensionFileAPI {
  read(): Promise<string>;
  readChunk(offset: number, length: number): Promise<ChunkResult>;
  update(content: string): void;
  updateBase64(base64: string): void;
  flush(): Promise<void>;
  onExternalChange(callback: (content: string | null) => void): () => void;
}

export interface ExtensionContext {
  filePath: string;
  file: ExtensionFileAPI;
  theme: 'light' | 'dark';
  isActive: boolean;
}
