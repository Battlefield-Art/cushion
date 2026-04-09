import type { ExtensionManifest } from './manifest.js';

function validateManifest(value: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { valid: false, errors: ['Manifest must be a non-null object'] };
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.id !== 'string' || obj.id.length === 0) {
    errors.push('id must be a non-empty string');
  }

  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    errors.push('name must be a non-empty string');
  }

  if (typeof obj.version !== 'string' || obj.version.length === 0) {
    errors.push('version must be a non-empty string');
  }

  if (obj.main !== undefined && (typeof obj.main !== 'string' || obj.main.length === 0)) {
    errors.push('main must be a non-empty string if provided');
  }

  if (!Array.isArray(obj.fileTypes)) {
    errors.push('fileTypes must be an array');
  } else if (obj.fileTypes.length === 0) {
    errors.push('fileTypes must have at least one entry');
  } else {
    for (let i = 0; i < obj.fileTypes.length; i++) {
      const ft = obj.fileTypes[i];
      if (typeof ft !== 'object' || ft === null || Array.isArray(ft)) {
        errors.push(`fileTypes[${i}] must be an object`);
        continue;
      }
      const ftObj = ft as Record<string, unknown>;
      if (!Array.isArray(ftObj.extensions) || ftObj.extensions.length === 0) {
        errors.push(`fileTypes[${i}].extensions must be a non-empty array`);
      } else {
        for (let j = 0; j < ftObj.extensions.length; j++) {
          if (typeof ftObj.extensions[j] !== 'string' || ftObj.extensions[j].length === 0) {
            errors.push(`fileTypes[${i}].extensions[${j}] must be a non-empty string`);
          }
        }
      }
      if (ftObj.binary !== undefined && typeof ftObj.binary !== 'boolean') {
        errors.push(`fileTypes[${i}].binary must be a boolean if provided`);
      }
    }
  }

  if (obj.description !== undefined && typeof obj.description !== 'string') {
    errors.push('description must be a string if provided');
  }

  if (obj.icon !== undefined && typeof obj.icon !== 'string') {
    errors.push('icon must be a string if provided');
  }

  return { valid: errors.length === 0, errors };
}

export function parseManifest(value: unknown): ExtensionManifest | null {
  const result = validateManifest(value);
  return result.valid ? (value as ExtensionManifest) : null;
}
