import type { ArenaModelPreset } from './arena-types';
import { isHeuristicModel, modelLabel } from './arena-shared';

export type ModelProvider =
  | 'openai'
  | 'google'
  | 'gemma'
  | 'anthropic'
  | 'xai'
  | 'deepseek'
  | 'zhipu'
  | 'nvidia'
  | 'sarvam'
  | 'qwen'
  | 'heuristic'
  | 'unknown';

const PROVIDER_LABELS: Record<ModelProvider, string> = {
  openai: 'OpenAI',
  google: 'Google',
  gemma: 'Google Gemma',
  anthropic: 'Anthropic',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  zhipu: 'Zhipu AI',
  nvidia: 'NVIDIA',
  sarvam: 'Sarvam AI',
  qwen: 'Qwen',
  heuristic: 'Built-in',
  unknown: 'Model',
};

const PROVIDER_SVGS: Record<ModelProvider, string> = {
  openai: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="OpenAI">
      <rect width="24" height="24" rx="6" fill="#0f172a"/>
      <path fill="#10A37F" d="M12 5.2c2.1 0 3.4 1.1 4 2.5.6-1.4 1.9-2.5 4-2.5 2.8 0 4.8 2.2 4.8 5.1 0 3.4-2.8 6.2-6.3 8.3-1 .6-2.1 1.1-3.2 1.5-.5.2-1 .2-1.5 0-1.1-.4-2.2-.9-3.2-1.5C6.7 16.5 3.9 13.7 3.9 10.3 3.9 7.4 5.9 5.2 8.7 5.2c.8 0 1.5.2 2.1.5.6-.3 1.3-.5 2.2-.5zm-1.8 3.4c-.9 0-1.6.7-1.6 1.6v2.4c0 .9.7 1.6 1.6 1.6h1.2v1.4c0 .5.4.9.9.9h1.4c.5 0 .9-.4.9-.9v-1.4h1.2c.9 0 1.6-.7 1.6-1.6v-2.4c0-.9-.7-1.6-1.6-1.6h-4.6z"/>
    </svg>
  `,
  google: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Google">
      <rect width="24" height="24" rx="6" fill="#ffffff"/>
      <path fill="#4285F4" d="M22 12c0-.68-.06-1.35-.16-2H12v3.76h5.64c-.24 1.28-.97 2.36-2.07 3.08v2.55h3.35c1.96-1.8 3.1-4.45 3.1-7.39z"/>
      <path fill="#34A853" d="M12 22c2.8 0 5.16-.93 6.88-2.52l-3.35-2.55c-.93.62-2.12 1-3.53 1-2.72 0-5.03-1.84-5.85-4.32H2.18v2.63C3.98 19.43 7.7 22 12 22z"/>
      <path fill="#FBBC05" d="M6.15 13.61c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V6.76H2.18C1.43 8.45 1 10.19 1 12s.43 3.55 1.18 5.24l3.97-3.63z"/>
      <path fill="#EA4335" d="M12 5.38c1.52 0 2.88.52 3.95 1.54l2.96-2.96C17.16 2.09 14.8 1 12 1 7.7 1 3.98 3.57 2.18 6.76l3.97 3.63C6.97 7.84 9.28 6 12 6v-.62z"/>
    </svg>
  `,
  anthropic: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Anthropic">
      <rect width="24" height="24" rx="6" fill="#f4e8df"/>
      <path fill="#d97757" d="M12 4.5 6.2 18h2.4l1.1-2.8h4.6l1.1 2.8h2.4L12 4.5zm-1.2 9.7 1.2-3.2 1.2 3.2h-2.4z"/>
    </svg>
  `,
  xai: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="xAI">
      <rect width="24" height="24" rx="6" fill="#0b0b0b"/>
      <path fill="#ffffff" d="m7.2 6.5 4.8 5.6L16.8 6.5H19l-6.2 7.1L19 17.5h-2.5l-4.9-5.7-4.9 5.7H5l6.3-7.2L5 6.5h2.2z"/>
    </svg>
  `,
  deepseek: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="DeepSeek">
      <rect width="24" height="24" rx="6" fill="#e8f1ff"/>
      <path fill="#3b82f6" d="M6.5 7.5h11v2.2h-4.1v8.8H9.6v-8.8H6.5V7.5zm8.4 0h2.6v11h-2.6V7.5z"/>
      <circle cx="17.8" cy="16.2" r="1.5" fill="#60a5fa"/>
    </svg>
  `,
  zhipu: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Zhipu AI">
      <rect width="24" height="24" rx="6" fill="#f3ecff"/>
      <path fill="#7c3aed" d="M7 6.5h4.2c2.5 0 4.1 1.4 4.1 3.6 0 1.5-.8 2.7-2.1 3.2l2.8 4.7h-2.8l-2.4-4.1H9.4v4.1H7V6.5zm2.4 2.1v2.7h1.7c1 0 1.6-.5 1.6-1.3s-.6-1.4-1.6-1.4H9.4z"/>
    </svg>
  `,
  gemma: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Google Gemma">
      <rect width="24" height="24" rx="6" fill="#fff7ed"/>
      <path fill="#ea580c" d="M8 7.5h8v2H8v-2zm0 4h5.5v2H8v-2zm0 4h7v2H8v-2z"/>
      <circle cx="17" cy="8.5" r="2" fill="#4285F4"/>
      <circle cx="17" cy="12.5" r="2" fill="#34A853"/>
      <circle cx="17" cy="16.5" r="2" fill="#FBBC05"/>
    </svg>
  `,
  nvidia: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="NVIDIA">
      <rect width="24" height="24" rx="6" fill="#0f172a"/>
      <path fill="#76b900" d="M7 8h10v2.2H7V8zm0 4.2h10v2.2H7v-2.2zm0 4.2h6.5v2.2H7v-2.2z"/>
    </svg>
  `,
  sarvam: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sarvam AI">
      <rect width="24" height="24" rx="6" fill="#fff4e8"/>
      <path fill="#c2410c" d="M12 6.5c2.8 0 5 2.2 5 5s-2.2 5-5 5-5-2.2-5-5 2.2-5 5-5zm0 2.2c-1.5 0-2.8 1.3-2.8 2.8S10.5 14.3 12 14.3s2.8-1.3 2.8-2.8S13.5 8.7 12 8.7z"/>
    </svg>
  `,
  qwen: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Qwen">
      <rect width="24" height="24" rx="6" fill="#eef2ff"/>
      <path fill="#4f46e5" d="M7.5 7.5h9v2h-9v-2zm0 4h6.5v2H7.5v-2zm0 4h8.5v2H7.5v-2z"/>
    </svg>
  `,
  heuristic: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Built-in heuristic">
      <rect width="24" height="24" rx="6" fill="#e8f5ef"/>
      <path fill="#2d6a4f" d="M7 8.5h10v1.8H7V8.5zm0 3.4h7.2v1.8H7v-1.8zm0 3.4h5.1v1.8H7v-1.8z"/>
      <path fill="#40916c" d="M16.8 15.3h2.2l-1.8 3.2h-1.9l1.5-3.2z"/>
    </svg>
  `,
  unknown: `
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Model provider">
      <rect width="24" height="24" rx="6" fill="#f1f5f9"/>
      <path fill="#64748b" d="M12 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm-5 8.5c0-2.2 2.2-4 5-4s5 1.8 5 4v1.5H7V15z"/>
    </svg>
  `,
};

export function providerFromModel(model: string): ModelProvider {
  if (isHeuristicModel(model)) return 'heuristic';
  const id = model.toLowerCase();
  if (id.startsWith('openai/') || id.includes('gpt')) return 'openai';
  if (id.includes('gemma')) return 'gemma';
  if (id.startsWith('google/') || id.includes('gemini')) return 'google';
  if (id.startsWith('anthropic/') || id.includes('claude')) return 'anthropic';
  if (id.startsWith('x-ai/') || id.startsWith('xai/') || id.includes('grok')) return 'xai';
  if (id.startsWith('deepseek/')) return 'deepseek';
  if (id.startsWith('z-ai/') || id.includes('glm')) return 'zhipu';
  if (id.startsWith('nvidia/') || id.includes('nemotron')) return 'nvidia';
  if (id.startsWith('sarvam')) return 'sarvam';
  if (id.startsWith('qwen/')) return 'qwen';
  return 'unknown';
}

export function providerDisplayName(provider: ModelProvider): string {
  return PROVIDER_LABELS[provider];
}

export function renderProviderLogo(provider: ModelProvider, size = 28): string {
  return `
    <span class="provider-logo provider-logo--${provider}" style="--provider-logo-size:${size}px" aria-hidden="true">
      ${PROVIDER_SVGS[provider]}
    </span>
  `;
}

export function renderBenchmarkModelCell(
  model: string,
  presets: ArenaModelPreset[],
  options: { rank?: number } = {}
): string {
  const provider = providerFromModel(model);
  const label = modelLabel(model, presets);
  return `
    <div class="benchmark-model-cell">
      ${options.rank ? `<span class="benchmark-rank">${options.rank}</span>` : ''}
      ${renderProviderLogo(provider)}
      <div class="benchmark-model-copy">
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(providerDisplayName(provider))}</span>
      </div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}