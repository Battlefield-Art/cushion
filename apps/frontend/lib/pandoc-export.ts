import type { PandocFormat } from '@cushion/types';
import { resolveWikiLink } from './wiki-link-resolver';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.avif']);
const WIKI_EMBED_REGEX = /!\[\[([^\]]+?)\]\]/g;
const WIKI_LINK_REGEX = /\[\[([^\[\]|#\n]+)(#[^\[\]|#\n]*)?(\|[^\[\]\n]*)?\]\]/g;
const HIGHLIGHT_REGEX = /==((?:(?!==).)+)==/g;
const CANCELED_TASK_REGEX = /^(\s*[-*+] )\[-\] (.+)$/gm;
const STD_IMAGE_REGEX = /!\[([^\]]*)\]\(([^)]+)\)/g;

function toAbsolute(relativePath: string, workspacePath: string): string {
  if (!workspacePath) return relativePath;
  const normalized = relativePath.replace(/\\/g, '/');
  if (/^[a-zA-Z]:/.test(normalized) || normalized.startsWith('/')) return relativePath;
  return `${workspacePath.replace(/\\/g, '/')}/${normalized}`;
}

function preprocessForPandocExport(markdown: string, filePaths: string[], workspacePath: string): string {
  let result = markdown;

  // Wiki-embeds (must run before wiki-links so `![[` is consumed first)
  result = result.replace(WIKI_EMBED_REGEX, (_match, inner: string) => {
    const pipeIdx = inner.lastIndexOf('|');
    let path = pipeIdx !== -1 ? inner.slice(0, pipeIdx) : inner;
    const param = pipeIdx !== -1 ? inner.slice(pipeIdx + 1) : '';

    const hashIdx = path.indexOf('#');
    if (hashIdx !== -1) path = path.slice(0, hashIdx);

    const ext = path.slice(path.lastIndexOf('.')).toLowerCase();

    const resolved = resolveWikiLink(path, filePaths);
    const target = resolved.state !== 'empty' && resolved.targets.length > 0
      ? resolved.targets[0]
      : path;
    const absTarget = toAbsolute(target, workspacePath);

    if (IMAGE_EXTS.has(ext)) {
      const alt = param && !/^\d+$/.test(param) ? param : '';
      return `![${alt}](<${absTarget}>)`;
    }

    const display = param || path;
    return `[${display}](<${absTarget}>)`;
  });

  // Wiki-links
  result = result.replace(WIKI_LINK_REGEX, (_match, rawHref: string, contentId: string | undefined, displayText: string | undefined) => {
    const href = rawHref.trim();
    const anchor = contentId ? contentId.trim() : '';
    const display = displayText ? displayText.slice(1).trim() : '';
    const fullHref = anchor ? `${href}${anchor}` : href;

    if (display) return `[${display}](${fullHref})`;

    const filename = href.split('/').pop() || href;
    const label = anchor ? `${filename} > ${anchor.slice(1)}` : filename;
    return `[${label}](${fullHref})`;
  });

  result = result.replace(STD_IMAGE_REGEX, (match, alt: string, href: string) => {
    if (/^https?:\/\/|^data:/.test(href)) return match;
    const clean = href.replace(/^<|>$/g, '');
    return `![${alt}](<${toAbsolute(clean, workspacePath)}>)`;
  });

  // Highlights
  result = result.replace(HIGHLIGHT_REGEX, '<mark>$1</mark>');

  // Canceled tasks
  result = result.replace(CANCELED_TASK_REGEX, '$1[ ] ~~$2~~');

  return result;
}

export async function exportWithPandoc(
  markdown: string,
  title: string,
  format: PandocFormat,
  filePaths: string[],
  workspacePath: string,
): Promise<{ success: boolean; path: string | null }> {
  const processed = preprocessForPandocExport(markdown, filePaths, workspacePath);
  return window.electronAPI.coordinatorInvoke('pandoc/export', {
    markdown: processed,
    title,
    format,
    workspacePath,
  });
}
