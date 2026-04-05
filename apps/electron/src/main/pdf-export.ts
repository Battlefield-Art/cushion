import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PDFDocument, PDFDict, PDFName, PDFString, PDFArray, PDFRef } from 'pdf-lib';

interface PdfExportOptions {
  pageSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  margins: 'default' | 'narrow' | 'none';
  showLinkUrls: boolean;
}

interface ExportPdfPayload {
  html: string;
  title: string;
  options: PdfExportOptions;
}

interface HeadingInfo {
  level: number;
  text: string;
}

function parseHeadings(html: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  const re = /<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const text = match[2].replace(/<[^>]*>/g, '').trim();
    if (text) {
      headings.push({ level: Number(match[1]), text });
    }
  }
  return headings;
}

async function addPdfMetadataAndOutline(
  pdfBuffer: Buffer,
  title: string,
  headings: HeadingInfo[],
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBuffer);

  doc.setTitle(title);
  doc.setCreationDate(new Date());
  doc.setProducer('Cushion');

  if (headings.length > 0) {
    const pages = doc.getPages();
    const firstPageRef = doc.getPage(0).ref;

    const outlineItemRefs: PDFRef[] = [];
    const outlineItems: PDFDict[] = [];

    for (const heading of headings) {
      const item = doc.context.obj({
        Title: PDFString.of(heading.text),
        Dest: [firstPageRef, PDFName.of('Fit')],
      });
      const ref = doc.context.register(item);
      outlineItemRefs.push(ref);
      outlineItems.push(item);
    }

    // Link items as a flat linked list
    for (let i = 0; i < outlineItems.length; i++) {
      if (i > 0) outlineItems[i].set(PDFName.of('Prev'), outlineItemRefs[i - 1]);
      if (i < outlineItems.length - 1) outlineItems[i].set(PDFName.of('Next'), outlineItemRefs[i + 1]);
    }

    const outline = doc.context.obj({
      Type: PDFName.of('Outlines'),
      First: outlineItemRefs[0],
      Last: outlineItemRefs[outlineItemRefs.length - 1],
      Count: outlineItems.length,
    });
    const outlineRef = doc.context.register(outline);

    // Set Parent on all items
    for (const item of outlineItems) {
      item.set(PDFName.of('Parent'), outlineRef);
    }

    doc.catalog.set(PDFName.of('Outlines'), outlineRef);
  }

  return doc.save();
}

ipcMain.handle('export:pdf', async (_event, { html, title, options }: ExportPdfPayload) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: `${title}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) return null;

  const win = new BrowserWindow({
    show: false,
    width: 800,
    height: 600,
    webPreferences: { offscreen: true },
  });

  const tmpPath = join(app.getPath('temp'), `cushion-print-${randomUUID()}.html`);

  try {
    await writeFile(tmpPath, html, 'utf-8');
    await win.loadFile(tmpPath);

    await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const imgs = Array.from(document.images);
        const pending = imgs.filter(i => !i.complete);
        if (!pending.length) return resolve();
        let n = pending.length;
        const done = () => { if (--n <= 0) resolve(); };
        pending.forEach(i => {
          i.addEventListener('load', done, { once: true });
          i.addEventListener('error', done, { once: true });
        });
        setTimeout(resolve, 10000);
      })
    `);

    const pdfBuffer = await win.webContents.printToPDF({
      pageSize: options.pageSize,
      landscape: options.orientation === 'landscape',
      printBackground: true,
      preferCSSPageSize: true,
      generateTaggedPDF: true,
    });

    const headings = parseHeadings(html);
    const finalBuffer = await addPdfMetadataAndOutline(
      Buffer.from(pdfBuffer),
      title,
      headings,
    );

    await writeFile(filePath, finalBuffer);
    return { success: true, path: filePath };
  } catch (err) {
    console.error('[pdf-export] Failed:', err);
    return { success: false, path: filePath };
  } finally {
    win.destroy();
    await unlink(tmpPath).catch(() => {});
  }
});
