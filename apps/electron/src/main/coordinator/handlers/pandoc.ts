import path from 'path';
import { randomUUID } from 'crypto';
import { writeFile, unlink } from 'fs/promises';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { app, dialog, type BrowserWindow } from 'electron';
import { PANDOC_FORMAT_META, type PandocFormat, type PandocBinaryStatus } from '@cushion/types';
import type { PandocBinaryManager } from '../pandoc-binary-manager';

const execFilePromise = promisify(execFileCb);

export function handlePandocBinaryStatus(manager: PandocBinaryManager): Promise<PandocBinaryStatus> {
  return manager.isBinaryAvailable();
}

export async function handlePandocEnsureBinary(manager: PandocBinaryManager) {
  return manager.ensureBinary();
}

export function handlePandocCancelDownload(manager: PandocBinaryManager) {
  return manager.cancelDownload();
}

export async function handlePandocExport(
  manager: PandocBinaryManager,
  params: { markdown: string; title: string; format: PandocFormat; workspacePath: string },
  mainWindow: BrowserWindow,
) {
  const status = await manager.isBinaryAvailable();
  if (!status.available || !status.path) throw new Error('Pandoc not available');

  const meta = PANDOC_FORMAT_META[params.format];
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `${params.title}.${meta.extension}`,
    filters: [{ name: meta.filterName, extensions: [meta.extension] }],
  });
  if (canceled || !filePath) return { success: false, path: null };

  const tmpInput = path.join(app.getPath('temp'), `cushion-pandoc-${randomUUID()}.md`);
  await writeFile(tmpInput, params.markdown, 'utf-8');

  const args = [
    tmpInput, '-o', filePath,
    '-f', 'markdown-implicit_figures',
    '-t', params.format,
    '--eol=lf',
    `--metadata=title:${params.title}`,
  ];
  if (['html', 'epub', 'latex'].includes(params.format)) args.push('--standalone');

  try {
    await execFilePromise(status.path, args, { timeout: 60000, windowsHide: true });
    return { success: true, path: filePath };
  } catch (err: any) {
    throw new Error(`Pandoc export failed: ${err.stderr || err.message}`);
  } finally {
    await unlink(tmpInput).catch(() => {});
  }
}
