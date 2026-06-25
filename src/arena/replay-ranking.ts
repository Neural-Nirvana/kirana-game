import type { ArenaReplaySummary } from './arena-types';

export function isHeuristicModel(model: string) {
  return model === 'heuristic-v2' || model === 'heuristic-v1';
}

/** Collapse heuristic-v1/v2 into one bucket for replay pickers. */
export function canonicalReplayModelKey(model: string) {
  if (isHeuristicModel(model)) return 'heuristic';
  return model;
}

export function modelMatchesReplay(targetModel: string, replayModel: string) {
  if (isHeuristicModel(targetModel) && isHeuristicModel(replayModel)) return true;
  return targetModel === replayModel;
}

export function replaySummaryRank(replay: Pick<ArenaReplaySummary, 'daysCompleted' | 'score' | 'savedAt'>) {
  return replay.score * 1_000_000_000 + replay.daysCompleted * 1_000 + Date.parse(replay.savedAt);
}

export function compareByFinalScore(
  a: Pick<ArenaReplaySummary, 'daysCompleted' | 'score' | 'savedAt'>,
  b: Pick<ArenaReplaySummary, 'daysCompleted' | 'score' | 'savedAt'>
) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.daysCompleted !== a.daysCompleted) return b.daysCompleted - a.daysCompleted;
  return Date.parse(b.savedAt) - Date.parse(a.savedAt);
}

export function compareReplaySummaries(
  a: Pick<ArenaReplaySummary, 'daysCompleted' | 'score' | 'savedAt'>,
  b: Pick<ArenaReplaySummary, 'daysCompleted' | 'score' | 'savedAt'>
) {
  return replaySummaryRank(b) - replaySummaryRank(a);
}

export function dedupeReplaySummariesByModel(replays: ArenaReplaySummary[]) {
  const byModel = new Map<string, ArenaReplaySummary>();
  for (const replay of replays) {
    const key = canonicalReplayModelKey(replay.model);
    const existing = byModel.get(key);
    if (!existing || compareReplaySummaries(replay, existing) < 0) {
      byModel.set(key, replay);
    }
  }
  return [...byModel.values()].sort(compareByFinalScore);
}

export function dedupeScoreboardRows<T extends Pick<ArenaReplaySummary, 'model' | 'daysCompleted' | 'score' | 'savedAt'>>(
  rows: T[]
) {
  const byModel = new Map<string, T>();
  for (const row of rows) {
    const key = canonicalReplayModelKey(row.model);
    const existing = byModel.get(key);
    if (!existing || compareReplaySummaries(row, existing) < 0) {
      byModel.set(key, row);
    }
  }
  return [...byModel.values()].sort(compareByFinalScore);
}