import { DEFAULT_NEIGHBORHOOD_PROFILE } from '../constants/neighborhood';
import type {
  ArenaJobResponse,
  ArenaModelPreset,
  ArenaModelsResponse,
  ArenaReplayDay,
  ArenaReplaySummary,
  ArenaRunSummary,
} from './arena-types';
import { isHeuristicModel, modelMatchesReplay } from './replay-ranking';

import effectCustomersUrl from '../assets/arena/effect-customers.png';
import effectKhataUrl from '../assets/arena/effect-khata.png';
import effectWarningUrl from '../assets/arena/effect-warning.png';
import productChipsUrl from '../assets/arena/product-chips.png';
import productMilkUrl from '../assets/arena/product-milk.png';

export type ArenaProfile = 'fast' | 'max';
export type ArenaPlaybackMode = 'manual' | 'auto';

export const RECENT_REPLAYS_KEY = 'shree-shyam-arena-recent-replays';
export const POLL_INTERVAL_MS = 3500;
export const AUTO_ADVANCE_DELAY_MS = 5200;
export const COMPLETE_REPLAY_DAYS = 30;

export const DEFAULT_MODEL_PRESETS: ArenaModelPreset[] = [
  { id: 'heuristic-v2', label: 'Built-in Heuristic', note: 'Instant local baseline. No OpenRouter cost.' },
  { id: 'google/gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', note: 'Fast US-provider candidate for live viewing.' },
  { id: 'google/gemini-3.5-flash', label: 'Gemini 3.5 Flash', note: 'Responses JSON-object Gemini candidate.' },
  { id: 'google/gemma-4-31b-it', label: 'Gemma 4 31B', note: 'Compact Google open model baseline.' },
  { id: 'openai/gpt-5.5', label: 'GPT 5.5', note: 'Strong OpenAI reasoning baseline. Uses Responses API.' },
  { id: 'openai/gpt-5.4-mini', label: 'GPT 5.4 Mini', note: 'OpenAI text model for low-latency kirana decisions.' },
  { id: 'google/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro', note: 'High-reasoning Gemini candidate. Uses Responses in max runs.' },
  { id: 'x-ai/grok-4.3', label: 'Grok 4.3', note: 'xAI high-reasoning candidate. Uses Responses JSON-object in max runs.' },
  { id: 'anthropic/claude-opus-4.8', label: 'Claude Opus 4.8', note: 'Premium Anthropic reasoning model. Smoke-test before full runs.' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b', label: 'Nemotron 3 Ultra 550B', note: 'NVIDIA text-JSON benchmark candidate.' },
  { id: 'sarvam-105b', label: 'Sarvam 105B', note: 'Indian model API benchmark via Sarvam.' },
  { id: 'qwen/qwen3.7-max', label: 'Qwen 3.7 Max', note: 'Alibaba high-intelligence JSON-object candidate.' },
  { id: 'z-ai/glm-5.2', label: 'GLM 5.2', note: 'Thinking-capable model. Can be slower.' },
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash', note: 'Fast DeepSeek profile with compact observation.' },
  { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro', note: 'Stronger DeepSeek candidate; max runs use high reasoning.' },
];

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(parseErrorMessage(detail) || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function parseErrorMessage(detail: string) {
  if (!detail) return '';
  try {
    const parsed = JSON.parse(detail) as { error?: string };
    return parsed.error ?? detail;
  } catch {
    return detail;
  }
}

export function primaryRun(job: ArenaJobResponse): ArenaRunSummary | undefined {
  return job.runs[0];
}

export function latestDecisionLatency(run: ArenaRunSummary | undefined) {
  return run?.decisions.at(-1)?.latencyMs ?? 0;
}

export function modelLabel(model: string, presets: ArenaModelPreset[]) {
  if (isHeuristicModel(model)) {
    return presets.find((preset) => isHeuristicModel(preset.id))?.label ?? 'Built-in Heuristic';
  }
  return presets.find((preset) => preset.id === model)?.label ?? model;
}

export function mergeModelPresets(
  defaults: ArenaModelPreset[],
  presets: ArenaModelPreset[],
  available: ArenaModelsResponse['available']
): ArenaModelPreset[] {
  const byId = new Map<string, ArenaModelPreset>();
  for (const preset of [...defaults, ...presets]) byId.set(preset.id, preset);
  for (const model of available.filter(isArenaTextModelHint).slice(0, 10)) {
    if (!model.id || byId.has(model.id)) continue;
    byId.set(model.id, {
      id: model.id,
      label: model.name ?? model.id,
      note: 'Live OpenRouter hint. Exact id will be passed through.',
    });
  }
  return Array.from(byId.values());
}

export function isArenaTextModelHint(model: ArenaModelsResponse['available'][number]) {
  const haystack = `${model.id} ${model.name ?? ''}`.toLowerCase();
  return !/\b(image|banana|audio|video|music|voice|tts|sora|veo|imagen)\b/.test(haystack);
}

export {
  canonicalReplayModelKey,
  compareByFinalScore,
  compareReplaySummaries,
  dedupeReplaySummariesByModel,
  dedupeScoreboardRows,
  isHeuristicModel,
  modelMatchesReplay,
  replaySummaryRank,
} from './replay-ranking';

export function replayScoreForPreset(replays: ArenaReplaySummary[], presetId: string) {
  return replays.find((replay) => modelMatchesReplay(presetId, replay.model))?.score;
}

export function sortModelPresetsByScore(presets: ArenaModelPreset[], replays: ArenaReplaySummary[]) {
  return [...presets].sort((a, b) => {
    const scoreA = replayScoreForPreset(replays, a.id);
    const scoreB = replayScoreForPreset(replays, b.id);
    if (scoreA !== undefined && scoreB !== undefined) return scoreB - scoreA;
    if (scoreA !== undefined) return -1;
    if (scoreB !== undefined) return 1;
    return 0;
  });
}

export function loadRecentReplays(): ArenaReplaySummary[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_REPLAYS_KEY) ?? '[]') as ArenaReplaySummary[];
    return parsed.filter((item) => item.runId && item.model).slice(0, 6);
  } catch {
    return [];
  }
}

export function saveRecentReplays(replays: ArenaReplaySummary[]) {
  try {
    window.localStorage.setItem(RECENT_REPLAYS_KEY, JSON.stringify(replays.slice(0, 6)));
  } catch {
    // Non-critical: replay truth is in SQLite.
  }
}

export function money(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

export function signed(value: number) {
  return `${value >= 0 ? '+' : ''}${Math.round(value)}`;
}

export function pad(value: number) {
  return value.toString().padStart(2, '0');
}

export function shortId(value: string) {
  return value.slice(0, 8);
}

export function compactSentence(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function weatherIcon(weather: string) {
  if (/rain/i.test(weather)) return '🌧';
  if (/heat/i.test(weather)) return '🔥';
  if (/hot/i.test(weather)) return '☀';
  if (/cloud/i.test(weather)) return '☁';
  return '🌤';
}

export function dayTone(day: ArenaReplayDay) {
  if (day.lastReward < 0) return 'bad';
  if (day.lastReward <= 6) return 'average';
  return 'good';
}

export function actionIcon(id: string) {
  if (id === 'marketing') return effectCustomersUrl;
  if (id === 'discount') return productChipsUrl;
  if (id === 'khata') return effectKhataUrl;
  if (id === 'waste') return effectWarningUrl;
  return productMilkUrl;
}

export function placeTypeLabel(type: string) {
  return type.replace(/_/g, ' ');
}

export function neighborhoodBrief(className: string) {
  const profile = DEFAULT_NEIGHBORHOOD_PROFILE;
  const school = profile.nearbyPlaces.find((place) => place.type === 'school');
  const societies = profile.nearbyPlaces.filter((place) => place.type === 'residential_society');
  const households = societies.reduce((sum, place) => sum + (place.households ?? 0), 0);

  return `
    <section class="${className}" aria-label="Fixed neighborhood context">
      <div class="a2-neighborhood-head">
        <span>Fixed Arena World</span>
        <strong>${escapeHtml(profile.name)}</strong>
      </div>
      <div class="a2-neighborhood-facts">
        <div><span>Catchment</span><strong>${profile.shopLocation.catchmentRadiusMeters}m</strong></div>
        <div><span>Societies</span><strong>${societies.length} · ${households} homes</strong></div>
        <div><span>School</span><strong>${school?.population ?? 0} students</strong></div>
        <div><span>Road</span><strong>${profile.commuteFlow.dailyPassersby.toLocaleString('en-IN')}/day</strong></div>
      </div>
    </section>
  `;
}

export function openingLiveMetrics(day: ArenaReplayDay) {
  const paidToday = day.visits.reduce((total, visit) => total + visit.amountPaid, 0);
  return {
    day: day.day,
    cash: Math.round(day.cash - paidToday),
    trust: Math.round(day.trust - day.trustDelta),
    score: day.score - day.lastReward,
    visits: 0,
    soldUnits: 0,
    missedUnits: 0,
    revenue: 0,
    khata: 0,
  };
}

export function finalLiveMetrics(day: ArenaReplayDay) {
  return {
    day: day.day,
    cash: day.cash,
    trust: day.trust,
    score: day.score,
    visits: day.metrics.visits,
    soldUnits: day.metrics.soldUnits,
    missedUnits: day.metrics.missedUnits,
    revenue: day.metrics.revenue,
    khata: day.metrics.khata,
  };
}
