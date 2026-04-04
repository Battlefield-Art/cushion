import { useEffect, useRef, useState } from 'react';
import { Square } from 'lucide-react';
import { useDictationStore, getAnalyserNode } from '@/stores/dictationStore';

const BAR_COUNT = 9;
const NOISE_GATE = 0.22;
const SMOOTHING = 0.82;
const GAIN = 1.4;
const CURVE = 0.7;

export function RecordingOverlay() {
  const status = useDictationStore((s) => s.status);
  const stopRecording = useDictationStore((s) => s.stopRecording);
  const [elapsed, setElapsed] = useState(0);
  const barsRef = useRef<(HTMLDivElement | null)[]>([]);
  const rafRef = useRef<number>(0);
  const loadingPhaseRef = useRef(0);
  const smoothedRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

  const setBarsRef = (i: number) => (el: HTMLDivElement | null) => {
    barsRef.current[i] = el;
  };

  // Timer
  useEffect(() => {
    if (status !== 'recording') {
      setElapsed(0);
      return;
    }
    const id = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [status]);

  // Waveform animation
  useEffect(() => {
    if (status === 'recording') {
      const dataArray = new Uint8Array(32);
      smoothedRef.current.fill(0);

      const animate = () => {
        const analyser = getAnalyserNode();
        if (analyser) {
          analyser.getByteFrequencyData(dataArray);

          for (let i = 0; i < BAR_COUNT; i++) {
            const raw = dataArray[i + 3] / 255;
            const gated = raw < NOISE_GATE ? 0 : (raw - NOISE_GATE) / (1 - NOISE_GATE);
            const shaped = Math.min(1, Math.pow(gated * GAIN, CURVE));

            smoothedRef.current[i] = smoothedRef.current[i] * SMOOTHING + shaped * (1 - SMOOTHING);

            let val = smoothedRef.current[i];
            if (i > 0 && i < BAR_COUNT - 1) {
              val = val * 0.7 + smoothedRef.current[i - 1] * 0.15 + smoothedRef.current[i + 1] * 0.15;
            }

            const bar = barsRef.current[i];
            if (!bar) continue;
            const h = Math.min(20, 2 + val * 18);
            bar.style.height = `${h}px`;
            bar.style.opacity = `${val < 0.01 ? 0.15 : Math.max(0.3, val)}`;
          }
        }
        rafRef.current = requestAnimationFrame(animate);
      };
      rafRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(rafRef.current);
    }

    if (status === 'transcribing' || status === 'post-processing') {
      const animate = () => {
        loadingPhaseRef.current += 0.06;
        for (let i = 0; i < BAR_COUNT; i++) {
          const bar = barsRef.current[i];
          if (!bar) continue;
          const wave = Math.sin(loadingPhaseRef.current + i * 0.7) * 0.5 + 0.5;
          const h = 3 + wave * 14;
          bar.style.height = `${h}px`;
          bar.style.opacity = `${0.3 + wave * 0.5}`;
        }
        rafRef.current = requestAnimationFrame(animate);
      };
      loadingPhaseRef.current = 0;
      rafRef.current = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(rafRef.current);
    }
  }, [status]);

  const isActive = status === 'recording' || status === 'transcribing' || status === 'post-processing';
  if (!isActive) return null;

  const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const seconds = String(elapsed % 60).padStart(2, '0');

  const label = status === 'transcribing'
    ? 'Transcribing'
    : status === 'post-processing'
      ? 'Processing'
      : null;

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-overlay flex items-center gap-2.5 pl-3 pr-2 py-1.5 rounded-full bg-[var(--color-base-100)] animate-in fade-in duration-300"
      style={{ minWidth: 160 }}
    >
      <div className="flex items-end justify-center gap-[3px] h-5 shrink-0">
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <div
            key={i}
            ref={setBarsRef(i)}
            className="w-[5px] rounded-sm"
            style={{
              height: '2px',
              opacity: 0.15,
              background: 'var(--color-base-00)',
              transition: status !== 'recording'
                ? 'height 80ms ease-out, opacity 80ms ease-out'
                : undefined,
            }}
          />
        ))}
      </div>

      <span className="text-[11px] font-mono tabular-nums select-none" style={{ color: 'var(--color-base-50)' }}>
        {label || `${minutes}:${seconds}`}
      </span>

      {status === 'recording' && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={stopRecording}
          className="size-6 flex items-center justify-center rounded-full transition-colors duration-100 hover:bg-[var(--color-base-70)] active:scale-95"
          style={{ color: 'var(--color-base-50)' }}
          title="Stop dictation"
        >
          <Square size={10} fill="currentColor" />
        </button>
      )}
    </div>
  );
}
