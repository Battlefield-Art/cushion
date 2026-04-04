import type { OllamaModelInfo, OllamaModelCategory } from '@cushion/types';

export const OLLAMA_MODEL_CATEGORIES: OllamaModelCategory[] = ['Gemma', 'Qwen', 'NVIDIA'];

export const OLLAMA_MODELS: OllamaModelInfo[] = [
  // Qwen 3.5
  {
    id: 'qwen3.5:0.8b',
    label: 'Qwen 3.5 0.8B',
    category: 'Qwen',
    parameterSize: '0.8B',
    sizeMb: 1000,
    description: 'Small but capable Qwen3.5 model',
    supportsThinking: true,
  },
  {
    id: 'qwen3.5:2b',
    label: 'Qwen 3.5 2B',
    category: 'Qwen',
    parameterSize: '2B',
    sizeMb: 2700,
    description: 'Small Qwen3.5 for quick tasks',
    supportsThinking: true,
  },
  {
    id: 'qwen3.5:4b',
    label: 'Qwen 3.5 4B',
    category: 'Qwen',
    parameterSize: '4B',
    sizeMb: 3400,
    description: 'Balanced Qwen3.5 for general use',
    supportsThinking: true,
  },
  {
    id: 'qwen3.5:9b',
    label: 'Qwen 3.5 9B',
    category: 'Qwen',
    parameterSize: '9B',
    sizeMb: 6600,
    description: 'Powerful hybrid model',
    supportsThinking: true,
  },

  // Gemma 3
  {
    id: 'gemma3:1b',
    label: 'Gemma 3 1B',
    category: 'Gemma',
    parameterSize: '1B',
    sizeMb: 815,
    description: 'Ultra-fast Google model, best for short dictation cleanup',
  },
  {
    id: 'gemma3:4b',
    label: 'Gemma 3 4B',
    category: 'Gemma',
    parameterSize: '4B',
    sizeMb: 3300,
    description: "Google's open-weight model, great balance of speed and quality",
    isRecommended: true,
  },
  {
    id: 'gemma3:12b',
    label: 'Gemma 3 12B',
    category: 'Gemma',
    parameterSize: '12B',
    sizeMb: 8100,
    description: "Google's mid-range model, strong reasoning",
  },

  // NVIDIA
  {
    id: 'nemotron-3-nano:4b',
    label: 'Nemotron 3 Nano 4B',
    category: 'NVIDIA',
    parameterSize: '4B',
    sizeMb: 2800,
    description: 'Efficient, open, and intelligent agentic model',
    supportsThinking: true,
  },
];
