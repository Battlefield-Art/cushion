import { useCallback, useEffect, useRef, useState } from 'react';

export const COMPACT_LABEL_LENGTHS = [0, 12, 8, 3, 1] as const;
export const COMPACT_LEVEL_MAX = COMPACT_LABEL_LENGTHS.length - 1;

export const VARIANT_SIZE_CLASSES = [
  'max-w-[160px] px-2.5',
  'max-w-[16ch] px-2.5',
  'max-w-[12ch] px-2',
  'max-w-[7ch] px-2',
  'px-1.5',
] as const;

export function getCompactLabel(label: string, maxLength = 3): string {
  const trimmed = label.trim();
  if (maxLength <= 0) return '';
  if (trimmed.length <= maxLength) return trimmed;
  if (maxLength <= 1) return trimmed.charAt(0);
  return `${trimmed.slice(0, maxLength)}...`;
}

type UsePromptCompactOptions = {
  shellMode: boolean;
  deps: unknown[];
};

const HYSTERESIS = 16;

export function usePromptCompact({ shellMode, deps }: UsePromptCompactOptions) {
  const [compactLevel, setCompactLevel] = useState(0);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const leftControlsRef = useRef<HTMLDivElement | null>(null);
  const rightControlsRef = useRef<HTMLDivElement | null>(null);
  const levelRef = useRef(0);
  const widthAtLevel = useRef<number[]>([]);

  const updateFooterCompact = useCallback(() => {
    if (shellMode) return;
    const footer = footerRef.current;
    const left = leftControlsRef.current;
    const right = rightControlsRef.current;
    if (!footer || !left || !right) return;

    const footerWidth = footer.getBoundingClientRect().width;
    const rightWidth = right.getBoundingClientRect().width;
    const available = footerWidth - rightWidth - 12;
    const contentWidth = left.scrollWidth;
    const current = levelRef.current;

    widthAtLevel.current[current] = contentWidth;

    let next = current;

    if (contentWidth > available + 2) {
      next = Math.min(current + 1, COMPACT_LEVEL_MAX);
    } else if (current > 0) {
      const lowerWidth = widthAtLevel.current[current - 1];
      if (lowerWidth !== undefined && lowerWidth <= available - HYSTERESIS) {
        next = current - 1;
      }
    }

    if (next !== current) {
      levelRef.current = next;
      setCompactLevel(next);
    }
  }, [shellMode]);

  useEffect(() => {
    levelRef.current = compactLevel;
  }, [compactLevel]);

  useEffect(() => {
    if (shellMode) return;
    widthAtLevel.current = [];
    levelRef.current = 0;
    setCompactLevel(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellMode, ...deps]);

  useEffect(() => {
    const footer = footerRef.current;
    if (!footer) return;

    let raf = 0;
    const settle = () => {
      const prev = levelRef.current;
      updateFooterCompact();
      if (levelRef.current !== prev && levelRef.current < COMPACT_LEVEL_MAX) {
        raf = requestAnimationFrame(settle);
      }
    };

    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(settle);
    };

    onResize();
    const observer = new ResizeObserver(onResize);
    observer.observe(footer);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [updateFooterCompact]);

  return { compactLevel, footerRef, leftControlsRef, rightControlsRef };
}
