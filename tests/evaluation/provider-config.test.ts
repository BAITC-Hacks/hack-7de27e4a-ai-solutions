import { describe, expect, it } from 'vitest';
import { readAgentTimeout, readProviderConfig } from '../../src/app/api/ai/provider-config';

describe('server provider environment', () => {
  it('never forwards the ambient OpenAI key to a custom provider', () => {
    for (const baseUrl of ['https://provider.example/v1', 'https://api.openai.com:8443/v1', 'https://api.openai.com.attacker.example/v1']) {
      expect(readProviderConfig({ OPENAI_API_KEY: 'shell-key', LLM_BASE_URL: baseUrl }).apiKey).toBe('');
      expect(readProviderConfig({ OPENAI_API_KEY: 'shell-key', LLM_API_KEY: 'explicit-key', LLM_BASE_URL: baseUrl }).apiKey).toBe('explicit-key');
    }
  });
  it('needs only an OpenAI key, including when optional template values are blank', () => {
    expect(readProviderConfig({ LLM_API_KEY: ' test-key ', LLM_BASE_URL: ' ', LLM_MODEL: '' })).toEqual({
      apiKey: 'test-key', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini',
    });
  });

  it('accepts the standard OpenAI environment variable and gives LLM_API_KEY precedence', () => {
    expect(readProviderConfig({ OPENAI_API_KEY: ' shell-key ', LLM_API_KEY: ' ' }).apiKey).toBe('shell-key');
    expect(readProviderConfig({ OPENAI_API_KEY: 'shell-key', LLM_API_KEY: 'local-key' }).apiKey).toBe('local-key');
    expect(readProviderConfig({}).apiKey).toBe('');
  });

  it('uses an explicit custom model and does not assume an OpenAI model for other endpoints', () => {
    expect(readProviderConfig({ LLM_BASE_URL: ' https://provider.example/v1 ', LLM_MODEL: ' private-model ' })).toMatchObject({
      baseUrl: 'https://provider.example/v1', model: 'private-model',
    });
    for (const baseUrl of ['https://provider.example/v1', 'http://localhost:8000/v1', 'https://api.openai.com.attacker.example/v1', 'invalid']) {
      expect(readProviderConfig({ LLM_BASE_URL: baseUrl }).model).toBe('');
    }
    expect(readProviderConfig({ LLM_BASE_URL: 'https://api.openai.com/v1/' }).model).toBe('gpt-4.1-mini');
  });

  it('gives the agent a separate timeout while preserving explicitly set legacy configuration', () => {
    expect(readAgentTimeout({})).toBe(10_000);
    expect(readAgentTimeout({ LLM_AGENT_TIMEOUT_MS: '', LLM_TIMEOUT_MS: '' })).toBe(10_000);
    expect(readAgentTimeout({ LLM_TIMEOUT_MS: '2500' })).toBe(2_500);
    expect(readAgentTimeout({ LLM_AGENT_TIMEOUT_MS: '10000', LLM_TIMEOUT_MS: '2500' })).toBe(10_000);
    expect(readAgentTimeout({ LLM_AGENT_TIMEOUT_MS: 'invalid' })).toBe(10_000);
    expect(readAgentTimeout({ LLM_AGENT_TIMEOUT_MS: '90000' })).toBe(30_000);
    expect(readAgentTimeout({ LLM_AGENT_TIMEOUT_MS: '0' })).toBe(1);
  });
});
