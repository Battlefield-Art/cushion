export const COMPACT_LABEL_LENGTHS = [0, 12, 8, 3, 1] as const;

export const COMPACT_SIZE_CLASSES = [
  'gap-1.5 pl-2 pr-1 max-w-[160px]',
  'gap-1.5 pl-2 pr-1 max-w-[16ch]',
  'gap-1 pl-2 pr-1 max-w-[12ch]',
  'gap-1 pl-2 pr-1 max-w-[7ch]',
  'gap-1 pl-1.5 pr-1',
] as const;

export function resolveCompactLevel(level?: number): number {
  const maxLevel = COMPACT_LABEL_LENGTHS.length - 1;
  if (typeof level !== 'number' || Number.isNaN(level)) return 0;
  return Math.min(Math.max(level, 0), maxLevel);
}

export function getCompactLabel(label: string, maxLength = 3): string {
  const trimmed = label.trim();
  if (maxLength <= 0) return '';
  if (trimmed.length <= maxLength) return trimmed;
  if (maxLength <= 1) return trimmed.charAt(0);
  return `${trimmed.slice(0, maxLength)}...`;
}
