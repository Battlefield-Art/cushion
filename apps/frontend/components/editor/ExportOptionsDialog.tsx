import { useCallback, useEffect, useState } from 'react';
import { FileDown, X, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANDOC_FORMAT_META } from '@cushion/types';
import type {
  PdfExportOptions,
  PdfPageSize,
  PdfOrientation,
  PdfMarginPreset,
  PandocFormat,
  PandocBinaryStatus,
} from '@cushion/types';
import { PandocDownloadGate } from './PandocDownloadGate';

interface ExportOptionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExportPdf: (options: PdfExportOptions) => void;
  onExportPandoc: (format: PandocFormat) => void;
}

const PAGE_SIZES: { value: PdfPageSize; label: string }[] = [
  { value: 'A4', label: 'A4' },
  { value: 'Letter', label: 'Letter' },
  { value: 'Legal', label: 'Legal' },
];

const ORIENTATIONS: { value: PdfOrientation; label: string }[] = [
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

const MARGINS: { value: PdfMarginPreset; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'narrow', label: 'Narrow' },
  { value: 'none', label: 'None' },
];

const PANDOC_FORMATS: { value: PandocFormat; label: string; description: string }[] = [
  { value: 'docx',  label: 'Word',         description: 'Microsoft Word document' },
  { value: 'epub',  label: 'EPUB',          description: 'E-book format' },
  { value: 'html',  label: 'HTML',          description: 'Standalone web page' },
  { value: 'odt',   label: 'OpenDocument',  description: 'LibreOffice / OpenOffice' },
  { value: 'latex', label: 'LaTeX',         description: 'TeX typesetting source' },
  { value: 'plain', label: 'Plain Text',    description: 'Stripped plain text' },
  { value: 'rtf',   label: 'RTF',           description: 'Rich text format' },
];

export function ExportOptionsDialog({
  isOpen,
  onClose,
  onExportPdf,
  onExportPandoc,
}: ExportOptionsDialogProps) {
  const [pageSize, setPageSize] = useState<PdfPageSize>('A4');
  const [orientation, setOrientation] = useState<PdfOrientation>('portrait');
  const [margins, setMargins] = useState<PdfMarginPreset>('default');
  const [showLinkUrls, setShowLinkUrls] = useState(false);
  const [headerText, setHeaderText] = useState('');
  const [footerText, setFooterText] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);

  if (!isOpen) return null;

  const handleExportPdf = () => {
    onExportPdf({ pageSize, orientation, margins, showLinkUrls, headerText, footerText });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-confirm flex items-center justify-center bg-[var(--overlay-50)]"
        onClick={onClose}
      >
        <div
          className="bg-modal-bg rounded-lg w-[520px] max-w-[90%] flex flex-col shadow-lg animate-slide-in border border-modal-border"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4">
            <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-border-subtle text-foreground-muted">
              <FileDown size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                Export PDF
              </h3>
              <p className="text-sm text-foreground-muted leading-normal">
                Configure export settings
              </p>
            </div>
            <button
              className="shrink-0 p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all"
              onClick={onClose}
              title="Close"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 pb-4 space-y-4">
            <OptionRow label="Page size">
              <SegmentedControl
                options={PAGE_SIZES}
                value={pageSize}
                onChange={setPageSize}
              />
            </OptionRow>

            <OptionRow label="Orientation">
              <SegmentedControl
                options={ORIENTATIONS}
                value={orientation}
                onChange={setOrientation}
              />
            </OptionRow>

            <OptionRow label="Margins">
              <SegmentedControl
                options={MARGINS}
                value={margins}
                onChange={setMargins}
              />
            </OptionRow>

            <OptionRow label="Header">
              <input
                type="text"
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                placeholder="Optional"
                className="w-48 px-2.5 py-1.5 rounded text-sm bg-transparent border border-modal-border text-foreground placeholder:text-foreground-muted/50 outline-none focus:border-accent transition-colors"
              />
            </OptionRow>

            <OptionRow label="Footer">
              <input
                type="text"
                value={footerText}
                onChange={(e) => setFooterText(e.target.value)}
                placeholder="Optional"
                className="w-48 px-2.5 py-1.5 rounded text-sm bg-transparent border border-modal-border text-foreground placeholder:text-foreground-muted/50 outline-none focus:border-accent transition-colors"
              />
            </OptionRow>

            <OptionRow label="Show link URLs">
              <button
                onClick={() => setShowLinkUrls(!showLinkUrls)}
                className={cn(
                  'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors',
                  showLinkUrls
                    ? 'bg-accent border-accent'
                    : 'bg-[var(--border-subtle)] border-border',
                )}
              >
                <span
                  className={cn(
                    'inline-block size-4 rounded-full bg-surface shadow transition-transform',
                    showLinkUrls ? 'translate-x-4' : 'translate-x-0.5',
                  )}
                />
              </button>
            </OptionRow>

            {/* Advanced Formats button */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <div className="text-sm font-medium text-foreground">Advanced Formats</div>
                <div className="text-xs text-foreground-muted">DOCX, EPUB, HTML, LaTeX and more</div>
              </div>
              <button
                type="button"
                onClick={() => setAdvancedOpen(true)}
                className="text-xs text-foreground-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-background-secondary cursor-pointer"
              >
                Manage
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 pt-4 pb-5">
            <button
              className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border border-modal-border bg-transparent text-foreground hover:bg-[var(--overlay-10)] transition-all"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border-none bg-accent text-surface hover:bg-accent-hover transition-all"
              onClick={handleExportPdf}
              autoFocus
            >
              Export
            </button>
          </div>
        </div>
      </div>

      {advancedOpen && (
        <AdvancedFormatsDialog
          onClose={() => setAdvancedOpen(false)}
          onExport={(format) => {
            setAdvancedOpen(false);
            onExportPandoc(format);
          }}
        />
      )}
    </>
  );
}

function AdvancedFormatsDialog({
  onClose,
  onExport,
}: {
  onClose: () => void;
  onExport: (format: PandocFormat) => void;
}) {
  const [pandocStatus, setPandocStatus] = useState<PandocBinaryStatus | null>(null);
  const [checkingPandoc, setCheckingPandoc] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<PandocFormat>('docx');

  const checkPandocStatus = useCallback(async () => {
    setCheckingPandoc(true);
    try {
      const status = await window.electronAPI.coordinatorInvoke('pandoc/binary-status', {});
      setPandocStatus(status);
    } catch {
      setPandocStatus({ available: false, path: null, version: null, source: null });
    } finally {
      setCheckingPandoc(false);
    }
  }, []);

  useEffect(() => {
    checkPandocStatus();
  }, [checkPandocStatus]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const pandocReady = pandocStatus?.available === true;

  return (
    <div
      className="fixed inset-0 z-confirm flex items-start justify-center pt-[10%] bg-[var(--overlay-50)]"
      onClick={onClose}
    >
      <div
        className="bg-modal-bg rounded-lg w-[520px] max-w-[90%] flex flex-col shadow-lg animate-slide-in border border-modal-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h3 className="text-base font-semibold text-foreground">Advanced Formats</h3>
          <button
            className="p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-foreground-muted px-5 mb-4">
          Export to additional formats via Pandoc.
          {pandocReady && pandocStatus!.source === 'system' && (
            <span className="text-foreground-faint ml-1">
              Using system Pandoc {pandocStatus!.version}
            </span>
          )}
        </p>

        {/* Pandoc status gate */}
        {checkingPandoc && (
          <div className="px-5 pb-5 flex items-center justify-center py-10">
            <Loader2 size={16} className="animate-spin text-foreground-muted mr-2" />
            <span className="text-sm text-foreground-muted">Checking Pandoc...</span>
          </div>
        )}

        {!checkingPandoc && pandocStatus && !pandocStatus.available && (
          <div className="px-5 pb-5 py-4">
            <PandocDownloadGate onInstalled={checkPandocStatus} />
          </div>
        )}

        {/* Format list */}
        {!checkingPandoc && pandocReady && (
          <>
            <div className="px-5 pb-4 space-y-1.5 max-h-[55vh] overflow-y-auto thin-scrollbar">
              {PANDOC_FORMATS.map((fmt) => {
                const isSelected = selectedFormat === fmt.value;
                const meta = PANDOC_FORMAT_META[fmt.value];
                return (
                  <div
                    key={fmt.value}
                    onClick={() => setSelectedFormat(fmt.value)}
                    className={cn(
                      'rounded-md border px-3.5 py-2.5 transition-all cursor-pointer',
                      isSelected
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-12)]'
                        : 'border-[var(--border)] hover:border-[var(--border-subtle)] hover:bg-[var(--overlay-10)]',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground">{fmt.label}</span>
                      <span className="text-[11px] text-foreground-faint">.{meta.extension}</span>
                      {isSelected && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--accent-primary)] bg-[var(--accent-primary-12)] px-1.5 py-0.5 rounded">
                          <Check size={10} />
                          Selected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground-muted mt-0.5">{fmt.description}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 pt-3 pb-5">
              <button
                className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border border-modal-border bg-transparent text-foreground hover:bg-[var(--overlay-10)] transition-all"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 rounded-md text-sm font-medium cursor-pointer border-none bg-accent text-surface hover:bg-accent-hover transition-all"
                onClick={() => onExport(selectedFormat)}
              >
                Export {PANDOC_FORMAT_META[selectedFormat].label.split(' ')[0]}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OptionRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground-muted">{label}</span>
      {children}
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'px-3 py-1.5 rounded text-sm cursor-pointer transition-all',
            opt.value === value
              ? 'bg-accent text-surface'
              : 'bg-transparent border border-modal-border text-foreground-muted hover:bg-[var(--overlay-10)]',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
