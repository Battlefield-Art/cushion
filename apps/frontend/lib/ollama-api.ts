const OLLAMA_BASE = 'http://localhost:11434';

export async function pingOllama(baseUrl = OLLAMA_BASE): Promise<boolean> {
  if (window.electronAPI) {
    const result = await window.electronAPI.coordinatorInvoke('ollama/list-models', { baseUrl });
    return result.models !== undefined;
  }
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

export interface LocalOllamaModel {
  name: string;
  sizeMb: number;
  parameterSize: string;
}

export async function fetchLocalOllamaModels(baseUrl = OLLAMA_BASE): Promise<LocalOllamaModel[]> {
  if (window.electronAPI) {
    const result = await window.electronAPI.coordinatorInvoke('ollama/list-models', { baseUrl });
    return result.models;
  }

  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return [];
    const data = await res.json();
    const models: LocalOllamaModel[] = [];
    for (const m of data.models ?? []) {
      models.push({
        name: m.name as string,
        sizeMb: Math.round((m.size as number) / (1024 * 1024)),
        parameterSize: (m.details?.parameter_size as string) ?? '',
      });
    }
    return models;
  } catch {
    return [];
  }
}

export interface PullProgress {
  status: string;
  error?: string;
  total?: number;
  completed?: number;
  percent: number;
}

export function pullOllamaModel(
  modelId: string,
  onProgress: (p: PullProgress) => void,
  baseUrl = OLLAMA_BASE,
): { cancel: () => void; done: Promise<boolean> } {
  if (window.electronAPI) {
    const cleanup = window.electronAPI.onCoordinatorNotification(
      'ollama/pull-progress',
      (data: PullProgress & { model: string }) => {
        if (data.model === modelId) {
          onProgress({
            status: data.status,
            error: data.error,
            total: data.total,
            completed: data.completed,
            percent: data.percent,
          });
        }
      },
    );

    const done = window.electronAPI
      .coordinatorInvoke('ollama/pull', { model: modelId, baseUrl })
      .then((result: { success: boolean }) => {
        cleanup();
        return result.success;
      })
      .catch(() => {
        cleanup();
        return false;
      });

    return {
      cancel: () => {
        window.electronAPI.coordinatorInvoke('ollama/cancel-pull', {});
        cleanup();
      },
      done,
    };
  }

  const controller = new AbortController();

  const done = (async () => {
    try {
      const res = await fetch(`${baseUrl}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelId, stream: true }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) return false;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastStatus = '';
      let success = false;

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.error) {
              onProgress({ status: 'error', error: json.error, percent: 0 });
              return false;
            }
            lastStatus = json.status ?? '';
            const total = json.total ?? 0;
            const completed = json.completed ?? 0;
            const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
            onProgress({ status: lastStatus, total, completed, percent });
            if (lastStatus === 'success') success = true;
          } catch {}
        }
      }

      return success || lastStatus.includes('up to date');
    } catch {
      return false;
    }
  })();

  return { cancel: () => controller.abort(), done };
}
