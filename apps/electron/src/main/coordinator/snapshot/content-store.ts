import fs from 'fs/promises';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import writeFileAtomic from 'write-file-atomic';

export class ContentStore {
  constructor(private readonly blobsDir: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.blobsDir, { recursive: true });
  }

  blobPath(sha: string): string {
    return path.join(this.blobsDir, sha.slice(0, 2), sha.slice(2));
  }

  async hashFile(absPath: string): Promise<string> {
    return await new Promise<string>((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(absPath);
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  async has(sha: string): Promise<boolean> {
    try {
      await fs.access(this.blobPath(sha));
      return true;
    } catch {
      return false;
    }
  }

  async writeBlobFromFile(sha: string, srcAbsPath: string): Promise<void> {
    const dest = this.blobPath(sha);
    if (await this.has(sha)) return;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    const data = await fs.readFile(srcAbsPath);
    await fs.writeFile(dest, data);
  }

  async readBlob(sha: string): Promise<Buffer> {
    return await fs.readFile(this.blobPath(sha));
  }

  async writeFileFromBlob(sha: string, destAbsPath: string): Promise<void> {
    const data = await this.readBlob(sha);
    await fs.mkdir(path.dirname(destAbsPath), { recursive: true });
    await writeFileAtomic(destAbsPath, data);
  }

  async deleteBlob(sha: string): Promise<void> {
    try {
      await fs.unlink(this.blobPath(sha));
    } catch {}
  }

  async listAll(): Promise<string[]> {
    const result: string[] = [];
    let topEntries: import('fs').Dirent[];
    try {
      topEntries = await fs.readdir(this.blobsDir, { withFileTypes: true });
    } catch {
      return result;
    }
    for (const top of topEntries) {
      if (!top.isDirectory()) continue;
      const subDir = path.join(this.blobsDir, top.name);
      let subs: import('fs').Dirent[];
      try {
        subs = await fs.readdir(subDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const sub of subs) {
        if (sub.isFile()) result.push(top.name + sub.name);
      }
    }
    return result;
  }
}
