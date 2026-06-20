import type { PlayerActions, RunObservation, StepRunResponse } from '../../types';

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
  async createRun(playerType: 'human' | 'ai' = 'human'): Promise<RunObservation> {
    return this.request<RunObservation>('/api/runs', {
      method: 'POST',
      body: JSON.stringify({ playerType }),
    });
  }

  async getState(runId: string): Promise<RunObservation> {
    return this.request<RunObservation>(`/api/runs/${encodeURIComponent(runId)}/state`);
  }

  async stepRun(runId: string, actions: PlayerActions): Promise<StepRunResponse> {
    return this.request<StepRunResponse>(`/api/runs/${encodeURIComponent(runId)}/step`, {
      method: 'POST',
      body: JSON.stringify({ actions }),
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
      headers: {
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `Request failed with ${response.status}`);
    }

    return response.json() as Promise<T>;
  }
}
