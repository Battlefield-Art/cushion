import { registerBundledView, unregisterView } from './view-registry';
import { ImageExtension } from '@/components/editor/ImageExtension';
import { PdfExtension } from '@/components/editor/PdfExtension';
import { ExcalidrawExtension } from '@/components/editor/ExcalidrawExtension';
import imageManifest from '@extensions/cushion-image/cushion-extension.json';
import pdfManifest from '@extensions/cushion-pdf/cushion-extension.json';
import excalidrawManifest from '@extensions/cushion-excalidraw/cushion-extension.json';
import type { ExtensionManifest } from '@cushion/extension-api';

const builtins: Array<{ manifest: ExtensionManifest; component: typeof ImageExtension }> = [
  { manifest: imageManifest as ExtensionManifest, component: ImageExtension },
  { manifest: pdfManifest as ExtensionManifest, component: PdfExtension },
  { manifest: excalidrawManifest as ExtensionManifest, component: ExcalidrawExtension },
];

const registeredIds = new Set<string>();

export function registerBuiltinViews(disabled?: Set<string>): void {
  for (const { manifest, component } of builtins) {
    const isDisabled = disabled?.has(manifest.id);
    const isRegistered = registeredIds.has(manifest.id);

    if (isDisabled && isRegistered) {
      unregisterView(manifest.id);
      registeredIds.delete(manifest.id);
    } else if (!isDisabled && !isRegistered) {
      registerBundledView(manifest, component);
      registeredIds.add(manifest.id);
    }
  }
}
