import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const targetRoot = join(repoRoot, 'apps', 'frontend', 'public', 'pdfjs');
const targetCssPath = join(targetRoot, 'pdf_viewer.css');

if (!existsSync(targetCssPath)) {
  throw new Error(`Cannot verify PDF.js assets: missing CSS at ${targetCssPath}`);
}

const cssContent = readFileSync(targetCssPath, 'utf8');
const referencedAssets = new Set();

for (const match of cssContent.matchAll(/url\(\s*(['"]?)(\/pdfjs\/images\/[^'")]+|images\/[^'")]+)\1\s*\)/g)) {
  const rawPath = match[2];
  const normalizedPath = rawPath.startsWith('/pdfjs/') ? rawPath.slice('/pdfjs/'.length) : rawPath;
  referencedAssets.add(normalizedPath);
}

const missingAssets = [...referencedAssets]
  .filter((assetPath) => !existsSync(join(targetRoot, assetPath)))
  .sort();

if (missingAssets.length > 0) {
  console.error('PDF.js asset verification failed. Missing files referenced by CSS:');
  for (const assetPath of missingAssets) {
    console.error(`- ${assetPath}`);
  }
  process.exit(1);
}

console.log(`PDF.js asset verification passed (${referencedAssets.size} referenced files).`);
