import { describe, expect, it } from 'vitest';
import { AI_SOURCES, detectAiSource, getAiSourceById } from '../src/lib/attribution/aiSources.js';

describe('AI_SOURCES catalog', () => {
  it('tem pelo menos os 8 assistentes exigidos, cada um com id/label/hosts/utmSources', () => {
    const requiredIds = [
      'chatgpt', 'perplexity', 'gemini', 'copilot', 'claude', 'deepseek', 'meta_ai', 'grok',
    ];
    for (const id of requiredIds) {
      const source = getAiSourceById(id);
      expect(source, `faltando fonte "${id}"`).toBeDefined();
      expect(source.label).toBeTruthy();
      expect(Array.isArray(source.hosts)).toBe(true);
      expect(source.hosts.length).toBeGreaterThan(0);
      expect(Array.isArray(source.utmSources)).toBe(true);
      expect(source.utmSources.length).toBeGreaterThan(0);
    }
    expect(AI_SOURCES.length).toBeGreaterThanOrEqual(requiredIds.length);
  });
});

describe('detectAiSource', () => {
  it('reconhece host exato no formato "host/path" (safeReferrer)', () => {
    expect(detectAiSource({ referrer: 'chatgpt.com/c/abc' })).toBe('chatgpt');
    expect(detectAiSource({ referrer: 'chat.openai.com' })).toBe('chatgpt');
    expect(detectAiSource({ referrer: 'perplexity.ai/search?q=x' })).toBe('perplexity');
  });

  it('reconhece subdomínio do host cadastrado', () => {
    expect(detectAiSource({ referrer: 'm.chatgpt.com/algo' })).toBe('chatgpt');
    expect(detectAiSource({ referrer: 'www.claude.ai' })).toBe('claude');
  });

  it('reconhece URL completa com protocolo', () => {
    expect(detectAiSource({ referrer: 'https://gemini.google.com/app' })).toBe('gemini');
    expect(detectAiSource({ referrer: 'https://grok.com/chat/123?x=1' })).toBe('grok');
  });

  it('reconhece por utm_source quando o referrer está ausente (ChatGPT mobile)', () => {
    expect(detectAiSource({ utm_source: 'chatgpt.com' })).toBe('chatgpt');
    expect(detectAiSource({ utm_source: 'chatgpt' })).toBe('chatgpt');
    expect(detectAiSource({ utm_source: 'openai' })).toBe('chatgpt');
  });

  it('é case-insensitive em host e utm_source', () => {
    expect(detectAiSource({ referrer: 'CHATGPT.COM/x' })).toBe('chatgpt');
    expect(detectAiSource({ utm_source: 'ChatGPT' })).toBe('chatgpt');
  });

  it('copilot só reconhece o host dedicado, não bing.com genérico', () => {
    expect(detectAiSource({ referrer: 'copilot.microsoft.com' })).toBe('copilot');
    expect(detectAiSource({ referrer: 'bing.com/chat' })).toBeNull();
    expect(detectAiSource({ referrer: 'bing.com' })).toBeNull();
  });

  it('não confunde domínio parecido com o host real (sufixo seguro, não substring)', () => {
    expect(detectAiSource({ referrer: 'notchatgpt.com.evil.com' })).toBeNull();
    expect(detectAiSource({ referrer: 'chatgpt.com.br' })).toBeNull();
    expect(detectAiSource({ referrer: 'fakechatgpt.com' })).toBeNull();
  });

  it('retorna null para fontes desconhecidas ou entrada vazia', () => {
    expect(detectAiSource({ referrer: 'google.com/search' })).toBeNull();
    expect(detectAiSource({ utm_source: 'facebook' })).toBeNull();
    expect(detectAiSource({})).toBeNull();
    expect(detectAiSource()).toBeNull();
  });
});
