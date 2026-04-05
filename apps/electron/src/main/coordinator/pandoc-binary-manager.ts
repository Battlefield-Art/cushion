import fs from 'fs/promises';
import { existsSync, createWriteStream } from 'fs';
import { execFile, spawn } from 'child_process';
import https from 'https';
import path from 'path';
import { app } from 'electron';
import type { PandocBinaryStatus } from '@cushion/types';

const PANDOC_VERSION = '3.6.4';
const GITHUB_RELEASE_URL = `https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}`;

const V = PANDOC_VERSION;

const PANDOC_BINARIES: Record<string, { archiveName: string; binaryName: string }> = {
  'win32-x64':    { archiveName: `pandoc-${V}-windows-x86_64.zip`,      binaryName: 'pandoc.exe' },
  'darwin-arm64': { archiveName: `pandoc-${V}-arm64-macOS.zip`,          binaryName: 'pandoc' },
  'darwin-x64':   { archiveName: `pandoc-${V}-x86_64-macOS.zip`,        binaryName: 'pandoc' },
  'linux-x64':    { archiveName: `pandoc-${V}-linux-amd64.tar.gz`,      binaryName: 'pandoc' },
  'linux-arm64':  { archiveName: `pandoc-${V}-linux-arm64.tar.gz`,      binaryName: 'pandoc' },
};

const MAX_REDIRECTS = 5;
const ALLOWED_REDIRECT_HOSTS = new Set([
  'github.com',
  'objects.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

type NotifyFn = (channel: string, data: unknown) => void;

export class PandocBinaryManager {
  private binDir: string;
  private notify: NotifyFn;
  private abortController: AbortController | null = null;
  private cachedStatus: PandocBinaryStatus | null = null;

  constructor(notify: NotifyFn) {
    this.notify = notify;
    this.binDir = path.join(app.getPath('userData'), 'bin', 'pandoc');
  }

  async init(): Promise<void> {
    await fs.mkdir(this.binDir, { recursive: true });
  }

  private getBinaryKey(): string {
    return `${process.platform}-${process.arch}`;
  }

  private getConfig() {
    return PANDOC_BINARIES[this.getBinaryKey()] ?? null;
  }

  private getManagedPath(): string | null {
    const config = this.getConfig();
    if (!config) return null;
    return path.join(this.binDir, config.binaryName);
  }

  async isBinaryAvailable(): Promise<PandocBinaryStatus> {
    const system = await this.checkSystemPandoc();
    if (system) {
      this.cachedStatus = {
        available: true,
        path: system.path,
        version: system.version,
        source: 'system',
      };
      return this.cachedStatus;
    }

    const managed = this.getManagedPath();
    if (managed && existsSync(managed)) {
      this.cachedStatus = {
        available: true,
        path: managed,
        version: PANDOC_VERSION,
        source: 'managed',
      };
      return this.cachedStatus;
    }

    this.cachedStatus = { available: false, path: null, version: null, source: null };
    return this.cachedStatus;
  }

  async ensureBinary(): Promise<{ path: string }> {
    const status = await this.isBinaryAvailable();
    if (status.available && status.path) return { path: status.path };
    return this.downloadBinary();
  }

  cancelDownload(): { cancelled: boolean } {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      return { cancelled: true };
    }
    return { cancelled: false };
  }

  getPandocPath(): string | null {
    return this.cachedStatus?.path ?? null;
  }

  private checkSystemPandoc(): Promise<{ available: boolean; path: string; version: string } | null> {
    return new Promise((resolve) => {
      execFile('pandoc', ['--version'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        if (err) {
          resolve(null);
          return;
        }
        const versionMatch = stdout.match(/pandoc(?:\.exe)?\s+(\d+\.\d+(?:\.\d+)?)/);
        const version = versionMatch?.[1] ?? 'unknown';

        const whichCmd = process.platform === 'win32' ? 'where' : 'which';
        execFile(whichCmd, ['pandoc'], { timeout: 5000, windowsHide: true }, (err2, pathOut) => {
          if (err2) {
            resolve({ available: true, path: 'pandoc', version });
            return;
          }
          resolve({
            available: true,
            path: pathOut.trim().split('\n')[0].trim(),
            version,
          });
        });
      });
    });
  }

  private async downloadBinary(): Promise<{ path: string }> {
    const config = this.getConfig();
    if (!config) throw new Error(`Unsupported platform/arch: ${this.getBinaryKey()}`);

    this.abortController = new AbortController();
    const archivePath = path.join(this.binDir, config.archiveName);
    const extractDir = path.join(this.binDir, `temp-pandoc-${this.getBinaryKey()}`);

    try {
      const url = `${GITHUB_RELEASE_URL}/${config.archiveName}`;
      await this.downloadFile(url, archivePath, 'pandoc/download');

      await fs.mkdir(extractDir, { recursive: true });
      await this.extractArchive(archivePath, extractDir);

      const binaryPath = await this.findFileInDir(extractDir, config.binaryName);
      if (!binaryPath) throw new Error(`Binary ${config.binaryName} not found in archive`);

      const outputPath = path.join(this.binDir, config.binaryName);
      await fs.copyFile(binaryPath, outputPath);
      if (process.platform !== 'win32') {
        await fs.chmod(outputPath, 0o755);
      }

      // macOS: remove quarantine flag
      if (process.platform === 'darwin') {
        await new Promise<void>((resolve) => {
          execFile('xattr', ['-dr', 'com.apple.quarantine', outputPath], { timeout: 5000 }, () => resolve());
        });
      }

      await fs.rm(extractDir, { recursive: true, force: true });
      await fs.rm(archivePath, { force: true });

      this.abortController = null;
      this.notify('pandoc/download-complete', { path: outputPath });
      return { path: outputPath };
    } catch (err: any) {
      await fs.rm(extractDir, { recursive: true, force: true }).catch(() => {});
      await fs.rm(archivePath, { force: true }).catch(() => {});
      this.abortController = null;
      this.notify('pandoc/download-error', { error: err.message });
      throw err;
    }
  }

  private extractArchive(archivePath: string, destDir: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const cwd = path.dirname(archivePath);
      const relArchive = path.basename(archivePath);
      const relDest = path.relative(cwd, destDir);

      const isGz = archivePath.endsWith('.tar.gz');
      const args = isGz
        ? ['-xzf', relArchive, '-C', relDest]
        : ['-xf', relArchive, '-C', relDest];

      const proc = spawn('tar', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        cwd,
      });

      let stderr = '';
      proc.stderr.on('data', (d) => { stderr += d.toString(); });
      proc.on('close', (code) => {
        if (code !== 0) reject(new Error(`Archive extraction failed (code ${code}): ${stderr.slice(0, 300)}`));
        else resolve();
      });
      proc.on('error', (err) => reject(new Error(`Failed to start tar: ${err.message}`)));
    });
  }

  private async findFileInDir(dir: string, fileName: string, depth = 0): Promise<string | null> {
    if (depth > 5) return null;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name === fileName) return fullPath;
      if (entry.isDirectory()) {
        const found = await this.findFileInDir(fullPath, fileName, depth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  private downloadFile(url: string, destPath: string, notifyPrefix: string): Promise<void> {
    return this.downloadWithRedirects(url, destPath, 0, notifyPrefix);
  }

  private downloadWithRedirects(url: string, destPath: string, redirectCount: number, notifyPrefix: string): Promise<void> {
    if (redirectCount > MAX_REDIRECTS) return Promise.reject(new Error('Too many redirects'));

    return new Promise((resolve, reject) => {
      if (!url.startsWith('https://')) {
        reject(new Error('Only HTTPS downloads are allowed'));
        return;
      }

      if (this.abortController?.signal.aborted) {
        reject(new Error('Download cancelled'));
        return;
      }

      const req = https.get(url, (res: any) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          try {
            const redirectUrl = new URL(res.headers.location);
            if (!ALLOWED_REDIRECT_HOSTS.has(redirectUrl.hostname)) {
              reject(new Error(`Redirect to unexpected host: ${redirectUrl.hostname}`));
              return;
            }
          } catch {
            reject(new Error('Invalid redirect URL'));
            return;
          }
          this.downloadWithRedirects(res.headers.location, destPath, redirectCount + 1, notifyPrefix)
            .then(resolve, reject);
          return;
        }

        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;
        let lastProgressTime = 0;

        const writeStream = createWriteStream(destPath);

        res.on('data', (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const now = Date.now();
          if (now - lastProgressTime >= 200) {
            lastProgressTime = now;
            this.notify(`${notifyPrefix}-progress`, {
              downloadedBytes,
              totalBytes,
              percent: totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0,
            });
          }
        });

        res.pipe(writeStream);
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
        res.on('error', reject);
      });

      req.on('error', reject);

      this.abortController?.signal.addEventListener('abort', () => {
        req.destroy();
        reject(new Error('Download cancelled'));
      }, { once: true });
    });
  }
}
