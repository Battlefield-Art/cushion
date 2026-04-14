import type { Part } from '@opencode-ai/sdk/v2/client';
import type { PromptPart } from '@/lib/prompt-dom';

type Inline =
  | {
      type: 'file';
      start: number;
      end: number;
      value: string;
      path: string;
      selection?: { startLine: number; endLine: number };
    }
  | {
      type: 'agent';
      start: number;
      end: number;
      value: string;
      name: string;
    };

function selectionFromFileUrl(url: string): { startLine: number; endLine: number } | undefined {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return undefined;
  const params = new URLSearchParams(url.slice(queryIndex + 1));
  const startLine = Number(params.get('start'));
  const endLine = Number(params.get('end'));
  if (!Number.isFinite(startLine) || !Number.isFinite(endLine)) return undefined;
  return { startLine, endLine };
}

function bestTextPart(parts: Part[]) {
  const candidates = parts
    .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
    .filter((p) => !p.synthetic && !p.ignored);
  return candidates.reduce<Extract<Part, { type: 'text' }> | undefined>((best, part) => {
    if (!best) return part;
    if (part.text.length > best.text.length) return part;
    return best;
  }, undefined);
}

export function extractPromptFromParts(parts: Part[], opts?: { directory?: string }): PromptPart[] {
  const textPart = bestTextPart(parts);
  const text = textPart?.text ?? '';
  const directory = opts?.directory;

  const toRelative = (path: string) => {
    if (!directory) return path;
    const prefix = directory.endsWith('/') || directory.endsWith('\\') ? directory : directory + '/';
    if (path.startsWith(prefix)) return path.slice(prefix.length);
    if (path.startsWith(directory)) {
      const next = path.slice(directory.length);
      if (next.startsWith('/') || next.startsWith('\\')) return next.slice(1);
      return next;
    }
    return path;
  };

  const inline: Inline[] = [];

  for (const part of parts) {
    if (part.type === 'file') {
      const source = (part as { source?: unknown }).source as
        | { type?: string; path?: string; text?: { value: string; start: number; end: number } }
        | undefined;
      const sourceText = source?.text;
      if (sourceText) {
        const value = sourceText.value;
        let path = value;
        if (value.startsWith('@')) path = value.slice(1);
        if (!value.startsWith('@') && source && typeof source.path === 'string') {
          path = source.path;
        }
        inline.push({
          type: 'file',
          start: sourceText.start,
          end: sourceText.end,
          value,
          path: toRelative(path),
          selection: selectionFromFileUrl((part as { url: string }).url),
        });
      }
    }

    if (part.type === 'agent') {
      const agent = part as { name: string; source?: { value: string; start: number; end: number } };
      const source = agent.source;
      if (!source) continue;
      inline.push({
        type: 'agent',
        start: source.start,
        end: source.end,
        value: source.value,
        name: agent.name,
      });
    }
  }

  inline.sort((a, b) => (a.start !== b.start ? a.start - b.start : a.end - b.end));

  const result: PromptPart[] = [];
  let position = 0;
  let cursor = 0;

  const pushText = (content: string) => {
    if (!content) return;
    result.push({ type: 'text', content, start: position, end: position + content.length });
    position += content.length;
  };

  const pushFile = (item: Extract<Inline, { type: 'file' }>) => {
    const content = item.value;
    result.push({
      type: 'file',
      path: item.path,
      content,
      start: position,
      end: position + content.length,
      selection: item.selection,
    });
    position += content.length;
  };

  const pushAgent = (item: Extract<Inline, { type: 'agent' }>) => {
    const content = item.value;
    result.push({
      type: 'agent',
      name: item.name,
      content,
      start: position,
      end: position + content.length,
    });
    position += content.length;
  };

  for (const item of inline) {
    if (item.start < 0 || item.end < item.start) continue;
    const expected = item.value;
    if (!expected) continue;

    const mismatch =
      item.end > text.length || item.start < cursor || text.slice(item.start, item.end) !== expected;
    const start = mismatch ? text.indexOf(expected, cursor) : item.start;
    if (start === -1) continue;
    const end = mismatch ? start + expected.length : item.end;

    pushText(text.slice(cursor, start));
    if (item.type === 'file') pushFile(item);
    if (item.type === 'agent') pushAgent(item);
    cursor = end;
  }

  pushText(text.slice(cursor));

  if (result.length === 0) {
    result.push({ type: 'text', content: '', start: 0, end: 0 });
  }

  return result;
}
