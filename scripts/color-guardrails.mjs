import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

const repoRoot = process.cwd();
const frontendRoot = join(repoRoot, 'apps', 'frontend');
const sourceExtensions = new Set(['.ts', '.tsx', '.css']);
const ignoredDirectories = new Set(['node_modules', '.next', 'dist', 'coverage']);

// Files allowed to contain raw color literals (foundation token definitions only)
const literalAllowlist = [
  /^apps\/frontend\/app\/globals\.css$/,
  /^apps\/frontend\/styles\/markdown-editor\.css$/,
  /^apps\/frontend\/styles\/opencode-chat\.css$/,
  /^apps\/frontend\/components\/editor\/pdf-constants\.ts$/,
  /^apps\/frontend\/public\/pdfjs\//,
  /^apps\/frontend\/lib\/pdf-export\.ts$/,
  /^apps\/frontend\/lib\/codemirror-wysiwyg\/ai-diff\.ts$/,
  /^apps\/frontend\/components\/settings\/AppearanceSettings\.tsx$/,
  /^apps\/frontend\/components\/settings\/AccentColorPicker\.tsx$/,
  /^apps\/frontend\/components\/ui\/LogoSpinner\.tsx$/,
  /^apps\/frontend\/components\/workspace\/FileTreeRow\.tsx$/,
  /^apps\/frontend\/src\/Home\.tsx$/,
];

// Files allowed to use Tailwind palette utility classes
// PdfToolbar uses text-white/border-white for contrast on accent backgrounds
const utilityAllowlist = [
  /^apps\/frontend\/components\/editor\/PdfToolbar\.tsx$/,
  /^apps\/frontend\/components\/editor\/PdfExtension\.tsx$/,
  /^apps\/frontend\/components\/editor\/pdf-constants\.ts$/,
  /^apps\/frontend\/components\/editor\/DictationButton\.tsx$/,
  /^apps\/frontend\/components\/editor\/EditorTabRow\.tsx$/,
  /^apps\/frontend\/components\/chat\/CustomizeDialog\.tsx$/,
  /^apps\/frontend\/components\/chat\/McpsPanel\.tsx$/,
  /^apps\/frontend\/components\/chat\/NotebookLmPanel\.tsx$/,
  /^apps\/frontend\/components\/settings\/AccentColorPicker\.tsx$/,
  /^apps\/frontend\/components\/settings\/DictationPostProcessing\.tsx$/,
  /^apps\/frontend\/components\/workspace\/WorkspaceModal\.tsx$/,
  /^apps\/frontend\/public\/pdfjs\//,
];

// Files allowed to use var(--token, #fallback) patterns (foundation definitions + vendor)
const fallbackAllowlist = [
  /^apps\/frontend\/app\/globals\.css$/,
  /^apps\/frontend\/styles\/markdown-editor\.css$/,
  /^apps\/frontend\/public\/pdfjs\//,
];

const rawColorLiteralPattern = /(?:#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\([^\n)]*\))/g;
const disallowedUtilityPattern = /\b(?:bg|text|border|ring|stroke|fill|caret|decoration|outline|shadow|from|to|via)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-(?:50|100|200|300|400|500|600|700|800|900|950)|\/(?:\d{1,3}|\[[^\]]+\]))?\b/g;
const fallbackPattern = /var\(\s*--[\w-]+\s*,\s*(?:#[0-9a-fA-F]{3,8}\b|(?:rgb|hsl)a?\([^)]*\))\s*\)/g;

function toPosixPath(pathValue) {
  return pathValue.replaceAll('\\', '/');
}

function matchesAllowlist(pathValue, allowlist) {
  return allowlist.some((pattern) => pattern.test(pathValue));
}

function walkFiles(directoryPath) {
  const files = [];
  const entries = readdirSync(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirectories.has(entry.name)) {
        continue;
      }

      files.push(...walkFiles(join(directoryPath, entry.name)));
      continue;
    }

    if (!sourceExtensions.has(extname(entry.name))) {
      continue;
    }

    files.push(join(directoryPath, entry.name));
  }

  return files;
}

function collectLineMatches(content, pattern) {
  const matches = [];
  const lines = content.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    pattern.lastIndex = 0;
    for (const match of lines[lineIndex].matchAll(pattern)) {
      matches.push({ line: lineIndex + 1, value: match[0] });
    }
  }

  return matches;
}

const filesToCheck = walkFiles(frontendRoot);
const literalViolations = [];
const utilityViolations = [];
const fallbackViolations = [];

for (const filePath of filesToCheck) {
  const relativePath = toPosixPath(relative(repoRoot, filePath));
  const fileContent = readFileSync(filePath, 'utf8');

  if (!matchesAllowlist(relativePath, literalAllowlist)) {
    const matches = collectLineMatches(fileContent, rawColorLiteralPattern);
    for (const match of matches) {
      literalViolations.push({ path: relativePath, line: match.line, value: match.value });
    }
  }

  if (!matchesAllowlist(relativePath, utilityAllowlist)) {
    const matches = collectLineMatches(fileContent, disallowedUtilityPattern);
    for (const match of matches) {
      utilityViolations.push({ path: relativePath, line: match.line, value: match.value });
    }
  }

  if (!matchesAllowlist(relativePath, fallbackAllowlist)) {
    const matches = collectLineMatches(fileContent, fallbackPattern);
    for (const match of matches) {
      fallbackViolations.push({ path: relativePath, line: match.line, value: match.value });
    }
  }
}

if (literalViolations.length === 0 && utilityViolations.length === 0 && fallbackViolations.length === 0) {
  console.log('Color guardrails passed.');
  process.exit(0);
}

console.error('Color guardrails failed.');

if (literalViolations.length > 0) {
  console.error('');
  console.error('Raw color literal violations (use semantic tokens or allowlisted exceptions):');
  for (const violation of literalViolations) {
    console.error(`- ${violation.path}:${violation.line} -> ${violation.value}`);
  }
}

if (utilityViolations.length > 0) {
  console.error('');
  console.error('Disallowed utility class violations (use semantic token classes):');
  for (const violation of utilityViolations) {
    console.error(`- ${violation.path}:${violation.line} -> ${violation.value}`);
  }
}

if (fallbackViolations.length > 0) {
  console.error('');
  console.error('Fallback literal violations (remove #hex fallback from var(), trust the token):');
  for (const violation of fallbackViolations) {
    console.error(`- ${violation.path}:${violation.line} -> ${violation.value}`);
  }
}

process.exit(1);
