export interface ExtensionFileType {
  /** File extensions this viewer handles (without leading dot, e.g. "csv"). */
  extensions: string[];
  /** Whether files are binary (base64 reads) or text. */
  binary?: boolean;
}

export interface ExtensionManifest {
  /** Unique extension identifier (e.g. "cushion.csv-viewer"). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Version string (semver recommended). */
  version: string;
  /** Entry point relative to the extension directory (optional for bundled extensions). */
  main?: string;
  /** File types this extension can view. */
  fileTypes: ExtensionFileType[];
  /** Optional description. */
  description?: string;
  /** Optional author name. */
  author?: string;
  /** Optional icon path relative to the extension directory. */
  icon?: string;
  /** Semver range for Cushion compatibility (e.g. ">=1.0"). */
  cushionVersion?: string;
}
