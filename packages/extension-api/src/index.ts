export type {
  ExtensionContext,
  ExtensionFileAPI,
  ExtensionDimensions,
  ChunkResult,
} from './context.js';

export type {
  ExtensionManifest,
  ExtensionFileType,
} from './manifest.js';

export {
  validateManifest,
  parseManifest,
} from './validate-manifest.js';

export type { ValidationResult } from './validate-manifest.js';
