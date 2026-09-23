import type { ProviderConfig } from './review/provider';

type Environment = Record<string, string | undefined>;
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const OPENAI_MODEL = 'gpt-4.1-mini';

/** Read per request: keys remain in server routes and may come from the local shell. */
export function readProviderConfig(env: Environment = process.env): ProviderConfig {
  const baseUrl = env.LLM_BASE_URL?.trim() || OPENAI_BASE_URL;
  let isOpenAI = false;
  try {
    const url = new URL(baseUrl);
    isOpenAI = url.protocol === 'https:' && url.hostname === 'api.openai.com';
  } catch { /* Provider validation reports an invalid endpoint without exposing it. */ }
  return {
    apiKey: env.LLM_API_KEY?.trim() || env.OPENAI_API_KEY?.trim() || '',
    baseUrl,
    model: env.LLM_MODEL?.trim() || (isOpenAI ? OPENAI_MODEL : ''),
  };
}

/** A separate agent budget avoids inheriting the critic's short timeout in new setups. */
export function readAgentTimeout(env: Environment = process.env): number {
  const raw = env.LLM_AGENT_TIMEOUT_MS?.trim() || env.LLM_TIMEOUT_MS?.trim();
  const value = raw ? Number(raw) : 10_000;
  return Number.isFinite(value) ? Math.max(1, Math.min(30_000, value)) : 10_000;
}
