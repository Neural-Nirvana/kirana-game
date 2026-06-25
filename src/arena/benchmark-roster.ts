import { canonicalReplayModelKey } from './replay-ranking';

/** Current 30-day harness roster — keep in sync with docs/ai-model-performance.md. */
export const OFFICIAL_BENCHMARK_MODEL_IDS = [
  'openai/gpt-5.5',
  'google/gemini-3.1-pro-preview',
  'anthropic/claude-opus-4.8',
  'google/gemini-3.1-flash-lite',
  'nvidia/nemotron-3-ultra-550b-a55b',
  'x-ai/grok-4.3',
  'google/gemma-4-31b-it',
  'sarvam-105b',
  'qwen/qwen3.7-max',
] as const;

const OFFICIAL_BENCHMARK_MODEL_SET = new Set<string>(OFFICIAL_BENCHMARK_MODEL_IDS);

export function isOfficialBenchmarkModel(model: string): boolean {
  return OFFICIAL_BENCHMARK_MODEL_SET.has(canonicalReplayModelKey(model));
}

export function filterOfficialBenchmarkRows<T extends { model: string }>(rows: T[]): T[] {
  return rows.filter((row) => isOfficialBenchmarkModel(row.model));
}