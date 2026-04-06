export type PandocFormat = 'docx' | 'epub' | 'html' | 'odt' | 'latex' | 'plain';

export interface PandocBinaryStatus {
  available: boolean;
  path: string | null;
  version: string | null;
  source: 'system' | 'managed' | null;
}

export const PANDOC_FORMAT_META: Record<PandocFormat, {
  label: string;
  extension: string;
  filterName: string;
}> = {
  docx:  { label: 'Word (.docx)',       extension: 'docx', filterName: 'Word Document' },
  epub:  { label: 'EPUB (.epub)',        extension: 'epub', filterName: 'EPUB' },
  html:  { label: 'HTML (.html)',        extension: 'html', filterName: 'HTML' },
  odt:   { label: 'OpenDocument (.odt)', extension: 'odt',  filterName: 'OpenDocument Text' },
  latex: { label: 'LaTeX (.tex)',        extension: 'tex',  filterName: 'LaTeX' },
  plain: { label: 'Plain Text (.txt)',   extension: 'txt',  filterName: 'Plain Text' },
};
