import type { RPCParams, RPCResult } from '@cushion/types';

const OLLAMA_BASE = 'http://localhost:11434';

let pullController: AbortController | null = null;

export async function handleOllamaListModels(
  params: RPCParams<'ollama/list-models'>,
): Promise<RPCResult<'ollama/list-models'>> {
  const baseUrl = params.baseUrl || OLLAMA_BASE;
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return { models: [] };
    const data = await res.json();
    const models: RPCResult<'ollama/list-models'>['models'] = [];
    for (const m of data.models ?? []) {
      models.push({
        name: m.name as string,
        sizeMb: Math.round((m.size as number) / (1024 * 1024)),
        parameterSize: (m.details?.parameter_size as string) ?? '',
      });
    }
    return { models };
  } catch {
    return { models: [] };
  }
}

export async function handleOllamaPull(
  params: RPCParams<'ollama/pull'>,
  notify: (channel: string, data: unknown) => void,
): Promise<RPCResult<'ollama/pull'>> {
  const baseUrl = params.baseUrl || OLLAMA_BASE;
  pullController = new AbortController();

  try {
    const res = await fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: params.model, stream: true }),
      signal: pullController.signal,
    });
    if (!res.ok || !res.body) return { success: false };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let lastStatus = '';
    let success = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.error) {
            notify('ollama/pull-progress', {
              model: params.model,
              status: 'error',
              error: json.error,
              percent: 0,
            });
            return { success: false };
          }
          lastStatus = json.status ?? '';
          const total = json.total ?? 0;
          const completed = json.completed ?? 0;
          const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
          notify('ollama/pull-progress', {
            model: params.model,
            status: lastStatus,
            total,
            completed,
            percent,
          });
          if (lastStatus === 'success') success = true;
        } catch {}
      }
    }

    return { success: success || lastStatus.includes('up to date') };
  } catch {
    return { success: false };
  } finally {
    pullController = null;
  }
}

export function handleOllamaCancelPull(): RPCResult<'ollama/cancel-pull'> {
  if (pullController) {
    pullController.abort();
    pullController = null;
    return { cancelled: true };
  }
  return { cancelled: false };
}
