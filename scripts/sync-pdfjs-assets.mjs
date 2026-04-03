import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = process.cwd();
const sourceRoot = join(repoRoot, 'apps', 'frontend', 'node_modules', 'pdfjs-dist', 'legacy', 'web');
const sourceCssPath = join(sourceRoot, 'pdf_viewer.css');
const sourceImagesDir = join(sourceRoot, 'images');

const targetRoot = join(repoRoot, 'apps', 'frontend', 'public', 'pdfjs');
const targetCssPath = join(targetRoot, 'pdf_viewer.css');
const targetImagesDir = join(targetRoot, 'images');

if (!existsSync(sourceCssPath)) {
  throw new Error(`Cannot sync PDF.js assets: missing source CSS at ${sourceCssPath}`);
}

if (!existsSync(sourceImagesDir)) {
  throw new Error(`Cannot sync PDF.js assets: missing source images directory at ${sourceImagesDir}`);
}

const sourceCss = readFileSync(sourceCssPath, 'utf8');
const referencedImages = new Set();
const missingSourceImages = new Set();

const rewrittenCss = sourceCss.replace(
  /url\(\s*(['"]?)images\/([^'")]+)\1\s*\)/g,
  (_fullMatch, _quote, fileName) => {
    const imageRelativePath = `images/${fileName}`;
    referencedImages.add(imageRelativePath);

    const sourceImagePath = join(sourceRoot, imageRelativePath);
    if (!existsSync(sourceImagePath)) {
      missingSourceImages.add(imageRelativePath);
      return 'none';
    }

    return `url(${imageRelativePath})`;
  },
);

mkdirSync(targetRoot, { recursive: true });
writeFileSync(targetCssPath, rewrittenCss, 'utf8');

rmSync(targetImagesDir, { recursive: true, force: true });
mkdirSync(targetImagesDir, { recursive: true });

const sourceImageFiles = readdirSync(sourceImagesDir)
  .filter((entry) => !entry.startsWith('.'))
  .sort();

for (const fileName of sourceImageFiles) {
  copyFileSync(join(sourceImagesDir, fileName), join(targetImagesDir, fileName));
}

// Copy the LICENSE file (resolve from the same pdfjs-dist used by frontend)
const pdfjsRoot = join(repoRoot, 'apps', 'frontend', 'node_modules', 'pdfjs-dist');
const sourceLicensePath = join(pdfjsRoot, 'LICENSE');
const targetLicensePath = join(targetRoot, 'LICENSE');
if (existsSync(sourceLicensePath)) {
  copyFileSync(sourceLicensePath, targetLicensePath);
  console.log(`Synced PDF.js LICENSE: ${targetLicensePath}`);
} else {
  console.warn(`Warning: PDF.js LICENSE not found at ${sourceLicensePath}`);
}

// Copy the worker script
const sourceWorkerPath = join(repoRoot, 'apps', 'frontend', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.min.mjs');
const targetWorkerPath = join(targetRoot, 'pdf.worker.min.mjs');
if (existsSync(sourceWorkerPath)) {
  copyFileSync(sourceWorkerPath, targetWorkerPath);
  console.log(`Synced PDF.js worker: ${targetWorkerPath}`);
} else {
  console.warn(`Warning: PDF.js worker not found at ${sourceWorkerPath}`);
}

console.log(`Synced PDF.js CSS: ${targetCssPath}`);
console.log(`Synced PDF.js image files: ${sourceImageFiles.length}`);
console.log(`Rewritten CSS image references: ${referencedImages.size}`);

if (missingSourceImages.size > 0) {
  const missing = [...missingSourceImages].sort();
  console.warn(
    `Replaced ${missing.length} unresolved PDF.js CSS image references with \"none\" (missing in pdfjs-dist):`,
  );
  for (const assetPath of missing) {
    console.warn(`- ${assetPath}`);
  }
}
