import { spawn, type ChildProcess } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import net from 'net';
import os from 'os';
import { app } from 'electron';
import type { DictationModelName, DictationServerStatus, DictationServerInfo, TranscriptionResult } from '@cushion/types';
import { SHERPA_MODEL_CATALOG, buildSherpaCliArgs } from './sherpa-model-catalog';
import WebSocket from 'ws';

const PORT_RANGE_START = 8200;
const PORT_RANGE_END = 8229;
const STARTUP_TIMEOUT_MS = 60000;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const TRANSCRIPTION_TIMEOUT_MS = 300000;

type NotifyFn = (channel: string, data: unknown) => void;

export class SherpaManager {
  private process: ChildProcess | null = null;
  private port: number | null = null;
  private ready = false;
  private status: DictationServerStatus = 'stopped';
  private modelName: DictationModelName | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private startupPromise: Promise<void> | null = null;
  private transcribing = false;
  private currentAccelerator: 'cpu' | 'gpu' = 'cpu';
  private notify: NotifyFn;
  private binDir: string;

  constructor(notify: NotifyFn) {
    this.notify = notify;
    this.binDir = path.join(app.getPath('userData'), 'bin', 'sherpa');
  }

  async init(): Promise<void> {
    // No-op; kept for interface compatibility
  }

  async start(modelName: DictationModelName, modelDir: string, language?: string, accelerator: 'cpu' | 'gpu' = 'cpu'): Promise<void> {
    if (this.startupPromise) return this.startupPromise;
    if (this.ready && this.modelName === modelName && this.currentAccelerator === accelerator) return;
    if (this.process) await this.stop();

    this.modelName = modelName;
    this.currentAccelerator = accelerator;
    this.startupPromise = this._doStart(modelName, modelDir, language, accelerator);
    try {
      await this.startupPromise;
    } finally {
      this.startupPromise = null;
    }
  }

  async stop(): Promise<void> {
    this.stopHealthCheck();

    if (!this.process) {
      this.ready = false;
      this.setStatus('stopped');
      return;
    }

    try {
      this.killProcess(this.process, 'SIGTERM');
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) this.killProcess(this.process, 'SIGKILL');
          resolve();
        }, 5000);
        if (this.process) {
          this.process.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });
    } catch {}

    this.process = null;
    this.ready = false;
    this.port = null;
    this.modelName = null;
    this.setStatus('stopped');
  }

  async transcribe(samplesBuffer: Buffer, sampleRate: number): Promise<TranscriptionResult> {
    if (!this.ready || !this.process) {
      throw new Error('sherpa-onnx server is not running');
    }

    return this.wsTranscribe(samplesBuffer, sampleRate);
  }

  getStatus(): DictationServerInfo {
    return {
      status: this.status,
      port: this.port,
      modelName: this.modelName,
    };
  }


  dispose(): void {
    this.stop().catch(() => {});
  }

  private setStatus(status: DictationServerStatus): void {
    this.status = status;
    this.notify('dictation/server-status-changed', this.getStatus());
  }

  private async _doStart(modelName: DictationModelName, modelDir: string, language?: string, accelerator: 'cpu' | 'gpu' = 'cpu'): Promise<void> {
    this.setStatus('starting');

    const isGpu = accelerator === 'gpu';
    const effectiveBinDir = isGpu ? path.join(this.binDir, 'gpu') : this.binDir;
    const wsBinary = this.getWsBinaryPath(accelerator);
    if (!wsBinary) throw new Error(`sherpa-onnx WS server binary not found (${accelerator})`);
    if (!existsSync(modelDir)) throw new Error(`Model directory not found: ${modelDir}`);

    const entry = SHERPA_MODEL_CATALOG[modelName];
    if (!entry) throw new Error(`Unknown model: ${modelName}`);

    this.port = await this.findAvailablePort();
    const numThreads = Math.max(1, Math.min(4, Math.floor(os.cpus().length * 0.75)));
    const args = buildSherpaCliArgs(modelDir, this.port, numThreads, entry, language);

    const spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    const pathSep = process.platform === 'win32' ? ';' : ':';
    spawnEnv.PATH = effectiveBinDir + pathSep + (process.env.PATH || '');

    if (isGpu && process.platform === 'linux') {
      spawnEnv.LD_LIBRARY_PATH = effectiveBinDir + pathSep + (process.env.LD_LIBRARY_PATH || '');
    }

    if (process.platform === 'win32') {
      const safeTmp = this.getSafeTempDir();
      spawnEnv.TEMP = safeTmp;
      spawnEnv.TMP = safeTmp;
    }

    console.log('[sherpa-onnx] Spawning:', wsBinary, args.join(' '));
    console.log('[sherpa-onnx] cwd:', effectiveBinDir, '| accelerator:', accelerator);

    this.process = spawn(wsBinary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: spawnEnv,
      cwd: effectiveBinDir,
    });

    let stderrBuffer = '';
    let exitCode: number | null = null;
    let readyResolve: ((value: boolean) => void) | null = null;
    const readyFromStderr = new Promise<boolean>((resolve) => {
      readyResolve = resolve;
    });

    this.process.stdout?.on('data', () => {});
    this.process.stderr?.on('data', (data) => {
      stderrBuffer += data.toString();
      if (data.toString().includes('Listening on:')) {
        readyResolve?.(true);
      }
    });

    this.process.on('error', () => {
      this.ready = false;
      readyResolve?.(false);
    });

    this.process.on('close', (code) => {
      exitCode = code;
      this.ready = false;
      this.process = null;
      this.stopHealthCheck();
      if (this.status === 'running') this.setStatus('error');
      readyResolve?.(false);
    });

    try {
      await this.waitForReady(readyFromStderr, () => ({ stderr: stderrBuffer, exitCode }));
    } catch (err) {
      this.setStatus('error');
      throw err;
    }

    this.startHealthCheck();
    this.setStatus('running');

    // Warm up with silent audio
    this.warmUp().catch(() => {});
  }

  private async warmUp(): Promise<void> {
    try {
      const sampleRate = 16000;
      const numSamples = sampleRate; // 1 second of silence
      const silentSamples = Buffer.alloc(numSamples * 4); // float32
      await this.wsTranscribe(silentSamples, sampleRate);
    } catch {}
  }

  private async waitForReady(
    readySignal: Promise<boolean>,
    getInfo: () => { stderr: string; exitCode: number | null },
  ): Promise<void> {
    const timeoutPromise = new Promise<boolean>((_, reject) => {
      setTimeout(() => reject(new Error(`sherpa-onnx failed to start within ${STARTUP_TIMEOUT_MS}ms`)), STARTUP_TIMEOUT_MS);
    });

    const ready = await Promise.race([readySignal, timeoutPromise]);

    if (!ready) {
      const info = getInfo();
      if (info.stderr) console.error('[sherpa-onnx] Full stderr:\n', info.stderr);
      const detail = info.stderr?.trim().slice(0, 500) || (info.exitCode !== null ? `exit code: ${info.exitCode}` : '');
      throw new Error(`sherpa-onnx process died during startup${detail ? `: ${detail}` : ''}`);
    }

    this.ready = true;
  }

  private wsTranscribe(samplesBuffer: Buffer, sampleRate: number): Promise<TranscriptionResult> {
    if (!this.ready || !this.process) {
      throw new Error('sherpa-onnx server is not running');
    }

    this.transcribing = true;

    return new Promise((resolve, reject) => {
      const cleanup = () => { this.transcribing = false; };

      const timeout = setTimeout(() => {
        try { ws.close(); } catch {}
        cleanup();
        reject(new Error('sherpa-onnx transcription timed out'));
      }, TRANSCRIPTION_TIMEOUT_MS);

      const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
      let result = '';

      ws.on('open', () => {
        // sherpa-onnx offline WS binary protocol:
        // [int32LE sample_rate][int32LE num_audio_bytes][float32 samples...]
        const message = Buffer.alloc(8 + samplesBuffer.length);
        message.writeInt32LE(sampleRate, 0);
        message.writeInt32LE(samplesBuffer.length, 4);
        samplesBuffer.copy(message, 8);
        ws.send(message);
      });

      ws.on('message', (data) => {
        result += data.toString();
        ws.send('Done');
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        cleanup();
        let text = result.trim();
        try {
          const parsed = JSON.parse(result);
          text = (parsed.text || '').trim();
        } catch {}
        resolve({ text, language: 'auto' });
      });

      ws.on('error', (error) => {
        clearTimeout(timeout);
        cleanup();
        reject(new Error(`sherpa-onnx transcription failed: ${error.message}`));
      });
    });
  }

  private async findAvailablePort(): Promise<number> {
    for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
      if (await this.isPortAvailable(port)) return port;
    }
    throw new Error(`No available ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
  }

  private isPortAvailable(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, '127.0.0.1');
    });
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckInterval = setInterval(() => {
      if (!this.process) {
        this.stopHealthCheck();
        return;
      }
      if (this.transcribing) return;

      if (!this.isProcessAlive()) {
        this.ready = false;
        this.setStatus('error');
        this.stopHealthCheck();
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }

  private isProcessAlive(): boolean {
    if (!this.process || this.process.killed) return false;
    try {
      process.kill(this.process.pid!, 0);
      return true;
    } catch {
      return false;
    }
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private getWsBinaryPath(accelerator: 'cpu' | 'gpu' = 'cpu'): string | null {
    const ext = process.platform === 'win32' ? '.exe' : '';
    const platformArch = `${process.platform}-${process.arch}`;
    const gpuSuffix = accelerator === 'gpu' ? '-gpu' : '';
    const binaryName = `sherpa-onnx-ws-${platformArch}${gpuSuffix}${ext}`;
    const binDir = accelerator === 'gpu' ? path.join(this.binDir, 'gpu') : this.binDir;
    const binaryPath = path.join(binDir, binaryName);
    if (existsSync(binaryPath)) return binaryPath;
    return null;
  }

  private getSafeTempDir(): string {
    const systemTemp = os.tmpdir();
    if (process.platform !== 'win32' || /^[\x21-\x7E]*$/.test(systemTemp)) {
      return systemTemp;
    }
    const fallbackBase = process.env.ProgramData || 'C:\\ProgramData';
    const fallback = path.join(fallbackBase, 'Cushion', 'temp');
    try {
      mkdirSync(fallback, { recursive: true });
      return fallback;
    } catch {
      return systemTemp;
    }
  }

  private killProcess(proc: ChildProcess, signal: 'SIGTERM' | 'SIGKILL'): void {
    if (!proc || proc.exitCode !== null) return;
    try {
      if (process.platform === 'win32') {
        if (signal === 'SIGKILL') {
          spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], {
            stdio: 'ignore',
            windowsHide: true,
          }).on('error', () => {});
        } else {
          proc.kill();
        }
      } else {
        proc.kill(signal);
      }
    } catch {}
  }
}
