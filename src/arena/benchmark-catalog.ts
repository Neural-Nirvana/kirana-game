/** Curated labels and diagnoses for published 30-day benchmark runs. */
export const BENCHMARK_MODEL_PRESETS = [
  { id: 'openai/gpt-5.5', label: 'GPT 5.5' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
  { id: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8' },
  { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra 550B' },
  { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash' },
  { id: 'x-ai/grok-4.3', label: 'Grok 4.3' },
  { id: 'google/gemma-4-31b-it', label: 'Gemma 4 31B' },
  { id: 'sarvam-105b', label: 'Sarvam 105B' },
  { id: 'qwen/qwen3.7-max', label: 'Qwen 3.7 Max' },
  { id: 'z-ai/glm-5.2', label: 'GLM 5.2' },
  { id: 'heuristic-v2', label: 'Built-in Heuristic' },
] as const;

export const BENCHMARK_DIAGNOSES: Record<string, string> = {
  'openai/gpt-5.5':
    'Strongest strategic run; 30/30 stored request-response records, protected trust, and used marketing well.',
  'google/gemini-3.1-pro-preview':
    'Top-tier high-reasoning run after Responses JSON-object compatibility fix; zero fallbacks and 96.5% service.',
  'anthropic/claude-opus-4.8':
    'Premium reasoning run after campaign-validation fixes; zero fallback days, high trust, and strong marketing ROI.',
  'google/gemini-3.1-flash-lite':
    'Best current fast baseline; no fallbacks, high trust, average latency around 2.5 seconds.',
  'nvidia/nemotron-3-ultra-550b-a55b':
    'Compatible text-JSON rerun; zero fallbacks and strong cash, but stockouts kept trust below the top models.',
  'google/gemini-3.5-flash':
    'Clean Responses JSON-object run with zero fallbacks; weaker trust than Gemini 3.1 Flash Lite from more stockouts.',
  'x-ai/grok-4.3':
    'Clean Responses JSON-object run with zero fallbacks, but trust remained weak because stockouts stayed frequent.',
  'google/gemma-4-31b-it':
    'Reliable JSON, but weaker service and trust preservation.',
  'sarvam-105b':
    'Direct Indian model API worked, but service gaps caused late trust collapse.',
  'qwen/qwen3.7-max':
    'Clean transport, but weak service coverage and trust collapse.',
  'z-ai/glm-5.2':
    'Technically clean at max reasoning, but essentials stockouts collapsed trust.',
};

export function getBenchmarkDiagnosis(model: string): string | undefined {
  return BENCHMARK_DIAGNOSES[model];
}