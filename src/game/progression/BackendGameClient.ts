import type { PlayerActions, PlayerSessionResponse, RunObservation, StepRunResponse } from '../../types';

interface AiRunResponse {
  runId: string;
  observation: RunObservation;
  timeline: unknown[];
  decisions: unknown[];
  summary: {
    totalScore: number;
    finalCash: number;
    finalTrust: number;
    daysCompleted: number;
  };
}

export class BackendGameClient {
  async getMe(): Promise<PlayerSessionResponse> {
    return this.request<PlayerSessionResponse>('/api/me');
  }

  async loginPlayer(playerName: string): Promise<PlayerSessionResponse> {
    return this.request<PlayerSessionResponse>('/api/auth/player', {
      method: 'POST',
      body: JSON.stringify({ playerName }),
    });
  }

  async logoutPlayer(): Promise<PlayerSessionResponse> {
    return this.request<PlayerSessionResponse>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async createRun(playerType: 'human' | 'ai' = 'human', runName?: string): Promise<RunObservation> {
    return this.request<RunObservation>('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ playerType, runName }),
    });
  }

  async getState(runId: string): Promise<RunObservation> {
    return this.request<RunObservation>(`/api/runs/${encodeURIComponent(runId)}/state`);
  }

  async stepRun(runId: string, actions: PlayerActions, expectedDay?: number): Promise<StepRunResponse> {
    return this.request<StepRunResponse>(`/api/runs/${encodeURIComponent(runId)}/step`, {
      method: 'POST',
      body: JSON.stringify({ actions, expectedDay }),
    });
  }

  async startAiRun(): Promise<AiRunResponse> {
    return this.request<AiRunResponse>('/api/ai-runs', {
      method: 'POST',
      body: JSON.stringify({ profile: 'balanced' }),
    });
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path, {
      ...init,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(this.parseErrorMessage(detail) || `Request failed with ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  private parseErrorMessage(detail: string): string {
    if (!detail) return '';
    try {
      const parsed = JSON.parse(detail) as { error?: string };
      return parsed.error ?? detail;
    } catch {
      return detail;
    }
  }
}
