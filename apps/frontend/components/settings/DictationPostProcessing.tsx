import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, X, Check, Star, Download } from 'lucide-react';
import { useDictationStore } from '@/stores/dictationStore';
import { cn } from '@/lib/utils';
import { ToggleRow } from './FilesSettings';
import { OLLAMA_MODELS, OLLAMA_MODEL_CATEGORIES } from './ollama-models';
import { pingOllama, fetchLocalOllamaModels, pullOllamaModel } from '@/lib/ollama-api';
import type { LocalOllamaModel } from '@/lib/ollama-api';
import type { OllamaModelInfo, OllamaModelCategory } from '@cushion/types';

export function DictationPostProcessing() {
  const updatePostProcessing = useDictationStore((s) => s.updatePostProcessing);
  const pp = useDictationStore((s) => s.postProcessing);

  const [apiKey, setApiKey] = useState(pp.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(pp.baseUrl || '');
  const [modelDialogOpen, setModelDialogOpen] = useState(false);

  useEffect(() => {
    setApiKey(pp.apiKey || '');
    setBaseUrl(pp.baseUrl || '');
  }, [pp]);

  const handleProviderChange = (next: 'openai' | 'ollama') => {
    const updates: Record<string, unknown> = { provider: next };
    if (next === 'ollama') {
      setBaseUrl('http://localhost:11434');
      updates.baseUrl = 'http://localhost:11434';
    } else if (next === 'openai') {
      setBaseUrl('');
      updates.baseUrl = undefined;
    }
    updatePostProcessing(updates);
  };

  const handleApiKeyBlur = () => {
    updatePostProcessing({ apiKey });
  };

  const handleBaseUrlBlur = () => {
    updatePostProcessing({ baseUrl: baseUrl || undefined });
  };

  const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Math.max(1, Math.min(15, Number(e.target.value) || 1));
    updatePostProcessing({ shortTextThreshold: val });
  };

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wide text-foreground-faint mb-3">Text Cleanup</h3>

      <ToggleRow
        label="Remove filler words"
        description="Remove uh, um, hmm and similar filler sounds"
        checked={pp.fillerRemoval}
        onChange={() => updatePostProcessing({ fillerRemoval: !pp.fillerRemoval })}
      />
      <ToggleRow
        label="Collapse stutters"
        description="Collapse repeated words (e.g. no no no → no)"
        checked={pp.stutterCollapse}
        onChange={() => updatePostProcessing({ stutterCollapse: !pp.stutterCollapse })}
      />
      <ToggleRow
        label="Auto-learn corrections"
        description="Learn new words when you edit dictated text"
        checked={pp.autoLearnCorrections}
        onChange={() => updatePostProcessing({ autoLearnCorrections: !pp.autoLearnCorrections })}
      />

      <h3 className="text-xs uppercase tracking-wide text-foreground-faint mb-3 mt-6">Post-Processing</h3>

      <ToggleRow
        label="Fuzzy correction"
        description="Auto-correct words using your dictionary"
        checked={pp.fuzzyCorrection}
        onChange={() => updatePostProcessing({ fuzzyCorrection: !pp.fuzzyCorrection })}
      />

      <ToggleRow
        label="AI post-processing"
        description="Clean up transcribed text with an LLM"
        checked={pp.enabled}
        onChange={() => updatePostProcessing({ enabled: !pp.enabled })}
      />
      <label className={cn('flex items-center justify-between gap-4 py-2', !pp.enabled && 'opacity-40 pointer-events-none')}>
        <div>
          <div className="text-sm font-medium">Skip short phrases</div>
          <div className="text-xs text-foreground-muted flex items-center gap-2">
            <span>Skip AI enhancement for very short phrases</span>
            {pp.skipShortTranscriptions && (
              <span className="inline-flex items-center gap-1">
                <span className="text-foreground-faint">Threshold</span>
                <input
                  type="number"
                  min={1}
                  max={15}
                  value={pp.shortTextThreshold}
                  onChange={handleThresholdChange}
                  onClick={(e) => e.stopPropagation()}
                  className="w-10 px-1 py-0 text-xs text-center rounded bg-surface border border-border text-foreground focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={pp.skipShortTranscriptions}
          disabled={!pp.enabled}
          onClick={() => updatePostProcessing({ skipShortTranscriptions: !pp.skipShortTranscriptions })}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors',
            pp.skipShortTranscriptions ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-subtle)]',
          )}
        >
          <span className={`pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-background transition-transform ${pp.skipShortTranscriptions ? 'translate-x-4' : 'translate-x-0.5'}`} />
        </button>
      </label>

      <ToggleRow
        label="Include note context"
        description="Send surrounding text to match tone and style"
        checked={pp.includeNoteContext ?? true}
        disabled={!pp.enabled}
        onChange={() => updatePostProcessing({ includeNoteContext: !(pp.includeNoteContext ?? true) })}
      />
      <ToggleRow
        label="Use dictionary with AI"
        description="Include custom dictionary in the AI prompt"
        checked={pp.dictionaryInPrompt}
        disabled={!pp.enabled}
        onChange={() => updatePostProcessing({ dictionaryInPrompt: !pp.dictionaryInPrompt })}
      />

      <div className={cn("flex items-center justify-between mt-3", !pp.enabled && "opacity-40")}>
        <div>
          <div className="text-sm font-medium">Processing Model</div>
          <div className="text-xs text-foreground-muted">
            {pp.model || 'gpt-4o-mini'} — {pp.provider === 'ollama' ? 'Local (Ollama)' : 'Cloud (OpenAI)'}
          </div>
        </div>
        <button
          type="button"
          disabled={!pp.enabled}
          onClick={() => setModelDialogOpen(true)}
          className={cn(
            'text-xs text-foreground-muted hover:text-foreground transition-colors px-3 py-1.5 rounded-md border border-border hover:bg-background-secondary',
            !pp.enabled && 'opacity-40 cursor-not-allowed',
          )}
        >
          Manage
        </button>
      </div>

      {modelDialogOpen && (
        <ProcessingModelDialog
          provider={pp.provider}
          apiKey={apiKey}
          baseUrl={baseUrl}
          model={pp.model}
          thinking={pp.thinking ?? false}
          onProviderChange={handleProviderChange}
          onApiKeyChange={setApiKey}
          onApiKeyBlur={handleApiKeyBlur}
          onBaseUrlChange={setBaseUrl}
          onBaseUrlBlur={handleBaseUrlBlur}
          onModelChange={(m: string) => updatePostProcessing({ model: m })}
          onThinkingChange={(v: boolean) => updatePostProcessing({ thinking: v })}
          onClose={() => setModelDialogOpen(false)}
        />
      )}
    </div>
  );
}

interface ProcessingModelDialogProps {
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  thinking: boolean;
  onProviderChange: (provider: 'openai' | 'ollama') => void;
  onApiKeyChange: (value: string) => void;
  onApiKeyBlur: () => void;
  onBaseUrlChange: (value: string) => void;
  onBaseUrlBlur: () => void;
  onModelChange: (value: string) => void;
  onThinkingChange: (value: boolean) => void;
  onClose: () => void;
}

type Tab = 'local' | 'cloud';

interface PullState {
  model: string;
  percent: number;
  status: string;
  error?: string;
}

function ProcessingModelDialog({
  provider,
  apiKey,
  baseUrl,
  model,
  thinking,
  onProviderChange,
  onApiKeyChange,
  onApiKeyBlur,
  onBaseUrlChange,
  onBaseUrlBlur,
  onModelChange,
  onThinkingChange,
  onClose,
}: ProcessingModelDialogProps) {
  const [tab, setTab] = useState<Tab>('local');
  const [showKey, setShowKey] = useState(false);
  const [customModel, setCustomModel] = useState('');
  const [localModels, setLocalModels] = useState<LocalOllamaModel[]>([]);
  const [ollamaReachable, setOllamaReachable] = useState<boolean | null>(null);
  const [pulling, setPulling] = useState<PullState | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const pulledNames = new Set(localModels.map((m) => m.name));
  for (const m of localModels) {
    pulledNames.add(m.name.replace(/:latest$/, ''));
  }

  const curatedIds = new Set(OLLAMA_MODELS.map((m) => m.id));
  const extraModels = localModels.filter((m) => {
    const base = m.name.replace(/:latest$/, '');
    return !curatedIds.has(m.name) && !curatedIds.has(base);
  });

  const isCustom = provider === 'ollama' && !OLLAMA_MODELS.some((m) => m.id === model) && !extraModels.some((m) => m.name === model || m.name.replace(/:latest$/, '') === model);

  useEffect(() => {
    if (isCustom && model) setCustomModel(model);
  }, []);

  useEffect(() => {
    pingOllama().then((up) => {
      setOllamaReachable(up);
      if (up) fetchLocalOllamaModels().then(setLocalModels);
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handlePull = (modelId: string) => {
    setPulling({ model: modelId, percent: 0, status: 'pulling manifest' });
    const { cancel, done } = pullOllamaModel(modelId, (p) => {
      if (p.error) {
        setPulling({ model: modelId, percent: 0, status: 'error', error: p.error });
      } else {
        setPulling({ model: modelId, percent: p.percent, status: p.status });
      }
    });
    cancelRef.current = cancel;
    done.then((ok) => {
      cancelRef.current = null;
      if (ok) {
        setPulling(null);
        fetchLocalOllamaModels().then(setLocalModels);
        handleSelectLocal(modelId);
      } else {
        setPulling((prev) => prev?.error ? prev : null);
      }
    });
  };

  const handleCancelPull = () => {
    cancelRef.current?.();
    setPulling(null);
    cancelRef.current = null;
  };

  const handleSelectLocal = (modelId: string) => {
    onProviderChange('ollama');
    onModelChange(modelId);
    setCustomModel('');
  };

  const handleSelectCustom = () => {
    onProviderChange('ollama');
    const value = customModel.trim() || model;
    onModelChange(value);
  };

  const handleCustomBlur = () => {
    if (customModel.trim()) {
      onProviderChange('ollama');
      onModelChange(customModel.trim());
    }
  };

  const handleSelectCloud = (cloudModel: string) => {
    onProviderChange('openai');
    onModelChange(cloudModel);
  };

  const grouped = new Map<OllamaModelCategory, OllamaModelInfo[]>();
  for (const cat of OLLAMA_MODEL_CATEGORIES) grouped.set(cat, []);
  for (const m of OLLAMA_MODELS) grouped.get(m.category)?.push(m);

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
          <h3 className="text-base font-semibold text-foreground">Processing Model</h3>
          <button
            className="p-1 rounded cursor-pointer flex items-center justify-center text-foreground-muted hover:bg-[var(--overlay-10)] hover:text-foreground transition-all"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-foreground-muted px-5 mb-3">
          Choose an LLM to clean up transcribed text.
        </p>

        <div className="flex items-center px-5 mb-4">
          <div className="flex gap-1">
            {([['local', 'Local'], ['cloud', 'Cloud']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  'px-3 py-1.5 text-xs rounded-md border transition-colors',
                  tab === key
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-12)] text-foreground'
                    : 'border-border text-foreground-muted hover:text-foreground hover:bg-[var(--overlay-10)]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {provider === 'ollama' && OLLAMA_MODELS.find((m) => m.id === model)?.supportsThinking && (
            <div className="ml-auto flex flex-col items-end gap-0.5">
              <button
                type="button"
                onClick={() => onThinkingChange(!thinking)}
                className="flex items-center gap-1.5 text-xs text-foreground-muted hover:text-foreground transition-colors"
              >
                <span>Thinking</span>
                <span
                  className={cn(
                    'relative inline-flex h-4 w-7 items-center rounded-full transition-colors',
                    thinking ? 'bg-[var(--accent-primary)]' : 'bg-[var(--border-subtle)]',
                  )}
                >
                  <span
                    className={cn(
                      'inline-block h-3 w-3 rounded-full bg-white transition-transform',
                      thinking ? 'translate-x-[13px]' : 'translate-x-[2px]',
                    )}
                  />
                </span>
              </button>
              <span className="text-[10px] text-foreground-faint">Much slower, needs a good GPU</span>
            </div>
          )}
        </div>

        {tab === 'local' && ollamaReachable === null && (
          <div className="px-5 pb-5 flex items-center justify-center py-10">
            <span className="text-sm text-foreground-muted">Checking Ollama...</span>
          </div>
        )}

        {tab === 'local' && ollamaReachable === false && (
          <div className="px-5 pb-5 flex flex-col items-center justify-center py-10 gap-3">
            <p className="text-sm text-foreground-muted text-center">
              Could not connect to Ollama.
            </p>
            <p className="text-xs text-foreground-faint text-center">
              Make sure Ollama is running by executing <code className="px-1.5 py-0.5 rounded bg-surface border border-border text-foreground text-xs">ollama serve</code> in your terminal.
            </p>
            <button
              type="button"
              onClick={() => {
                setOllamaReachable(null);
                pingOllama().then((up) => {
                  setOllamaReachable(up);
                  if (up) fetchLocalOllamaModels().then(setLocalModels);
                });
              }}
              className="mt-2 px-3 py-1.5 text-xs rounded-md border border-border text-foreground-muted hover:text-foreground hover:bg-[var(--overlay-10)] transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {tab === 'local' && ollamaReachable === true && (
          <div className="px-5 pb-5 space-y-5 max-h-[55vh] overflow-y-auto thin-scrollbar">
            {OLLAMA_MODEL_CATEGORIES.map((cat) => {
              const catModels = grouped.get(cat);
              if (!catModels || catModels.length === 0) return null;
              return (
                <div key={cat}>
                  <div className="text-[11px] font-medium text-foreground-faint uppercase tracking-wider mb-2">{cat}</div>
                  <div className="space-y-1.5">
                    {catModels.map((m) => {
                      const isSelected = provider === 'ollama' && model === m.id;
                      const isPulled = pulledNames.has(m.id);
                      const isPulling = pulling?.model === m.id;
                      return (
                        <OllamaModelCard
                          key={m.id}
                          model={m}
                          isSelected={isSelected}
                          isPulled={isPulled}
                          isPulling={isPulling}
                          pullPercent={isPulling ? pulling.percent : 0}
                          pullStatus={isPulling ? pulling.status : ''}
                          pullError={isPulling ? pulling.error : undefined}
                          onSelect={() => handleSelectLocal(m.id)}
                          onPull={() => handlePull(m.id)}
                          onCancelPull={handleCancelPull}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* ── Extra local models (not in curated list) ── */}
            {extraModels.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-foreground-faint uppercase tracking-wider mb-2">Installed</div>
                <div className="space-y-1.5">
                  {extraModels.map((m) => {
                    const baseName = m.name.replace(/:latest$/, '');
                    const isSelected = provider === 'ollama' && (model === m.name || model === baseName);
                    const sizeLabel = m.sizeMb >= 1000
                      ? `${(m.sizeMb / 1000).toFixed(1)} GB`
                      : `${m.sizeMb} MB`;
                    return (
                      <div
                        key={m.name}
                        onClick={() => handleSelectLocal(baseName)}
                        className={cn(
                          'relative rounded-md border px-3.5 py-2.5 transition-all group cursor-pointer',
                          isSelected
                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-12)]'
                            : 'border-[var(--border)] hover:border-[var(--border-subtle)] hover:bg-[var(--overlay-10)]',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground">{baseName}</span>
                          {isSelected && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--accent-primary)] bg-[var(--accent-primary-12)] px-1.5 py-0.5 rounded">
                              <Check size={10} />
                              Active
                            </span>
                          )}
                        </div>
                        <div className="flex items-center mt-1.5 text-[11px] text-foreground-faint">
                          {m.parameterSize && <span>{m.parameterSize}</span>}
                          <span className="flex-1" />
                          <span>{sizeLabel}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] font-medium text-foreground-faint uppercase tracking-wider mb-2">Custom</div>
              <div
                onClick={handleSelectCustom}
                className={cn(
                  'rounded-md border px-3.5 py-2.5 transition-all cursor-pointer',
                  isCustom && provider === 'ollama'
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-12)]'
                    : 'border-border hover:border-[var(--border-subtle)] hover:bg-[var(--overlay-10)]',
                )}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-medium text-sm text-foreground">Custom Model</span>
                  {isCustom && provider === 'ollama' && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--accent-primary)] bg-[var(--accent-primary-12)] px-1.5 py-0.5 rounded">
                      <Check size={10} />
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-foreground-muted mb-2">Enter any Ollama model name</p>
                <input
                  type="text"
                  value={customModel}
                  onChange={(e) => setCustomModel(e.target.value)}
                  onBlur={handleCustomBlur}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomBlur(); }}
                  placeholder="e.g. mistral:7b"
                  className="w-full px-3 py-1.5 text-sm rounded-md bg-surface border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>
          </div>
        )}

        {tab === 'cloud' && (
          <div className="px-5 pb-5 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => onApiKeyChange(e.target.value)}
                  onBlur={onApiKeyBlur}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 pr-9 text-sm rounded-md bg-surface border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-foreground-muted hover:text-foreground transition-colors"
                  aria-label={showKey ? 'Hide API key' : 'Show API key'}
                >
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Model</label>
              <input
                type="text"
                value={provider === 'openai' ? model : ''}
                onChange={(e) => handleSelectCloud(e.target.value)}
                placeholder="gpt-4o-mini"
                className="w-full px-3 py-2 text-sm rounded-md bg-surface border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Base URL</label>
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => onBaseUrlChange(e.target.value)}
                onBlur={onBaseUrlBlur}
                placeholder="https://api.openai.com/v1/chat/completions"
                className="w-full px-3 py-2 text-sm rounded-md bg-surface border border-border text-foreground placeholder:text-foreground-muted focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <p className="text-[11px] text-foreground-faint mt-1">Leave empty for default OpenAI endpoint</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Ollama model card ── */

function OllamaModelCard({
  model,
  isSelected,
  isPulled,
  isPulling,
  pullPercent,
  pullStatus,
  pullError,
  onSelect,
  onPull,
  onCancelPull,
}: {
  model: OllamaModelInfo;
  isSelected: boolean;
  isPulled: boolean;
  isPulling: boolean;
  pullPercent: number;
  pullStatus: string;
  pullError?: string;
  onSelect: () => void;
  onPull: () => void;
  onCancelPull: () => void;
}) {
  const sizeLabel = model.sizeMb >= 1000
    ? `${(model.sizeMb / 1000).toFixed(1)} GB`
    : `${model.sizeMb} MB`;

  return (
    <div
      onClick={() => isPulled && onSelect()}
      className={cn(
        'relative rounded-md border px-3.5 py-2.5 transition-all group',
        isSelected && isPulled
          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-12)]'
          : isPulled
            ? 'border-[var(--border)] hover:border-[var(--border-subtle)] hover:bg-[var(--overlay-10)] cursor-pointer'
            : 'border-[var(--border)] opacity-60',
        isPulling && 'opacity-100 border-[var(--border)]',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm text-foreground">{model.label}</span>

        {isSelected && isPulled && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--accent-primary)] bg-[var(--accent-primary-12)] px-1.5 py-0.5 rounded">
            <Check size={10} />
            Active
          </span>
        )}

        {model.isRecommended && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-[var(--accent-primary)] bg-[var(--accent-primary-12)] px-1.5 py-0.5 rounded">
            <Star size={10} />
            Recommended
          </span>
        )}
      </div>

      <p className="text-xs text-foreground-muted mt-0.5">{model.description}</p>

      <div className="flex items-center mt-2 text-[11px] text-foreground-faint">
        <span>{model.parameterSize}</span>
        <span className="flex-1" />

        {isPulling ? (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onCancelPull(); }}
            className="inline-flex items-center gap-1 text-foreground-muted hover:text-foreground transition-colors"
            aria-label="Cancel download"
          >
            <X size={12} />
            Cancel
          </button>
        ) : isPulled ? (
          <span className="inline-flex items-center gap-1 text-foreground-faint">
            <Check size={11} />
            Installed
          </span>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPull(); }}
            className="inline-flex items-center gap-1 text-foreground-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label={`Download ${model.label}`}
          >
            <Download size={11} />
            {sizeLabel}
          </button>
        )}
      </div>

      {isPulling && !pullError && (
        <div className="mt-2">
          <div className="h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
            <div
              className="h-full bg-[var(--accent-primary)] transition-all duration-300"
              style={{ width: `${pullPercent}%` }}
            />
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-foreground-faint">
              {pullPercent > 0 ? `${pullPercent}%` : pullStatus || 'Starting...'}
            </span>
          </div>
        </div>
      )}

      {pullError && (
        <p className="mt-1.5 text-[11px] text-[var(--error)]">{pullError.trim()}</p>
      )}
    </div>
  );
}
