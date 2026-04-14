import { describe, it, expect, vi } from 'vitest';
import {
  extractMemories,
  classifySource,
  extractFactsSimple,
  ExtractedFact,
} from './extraction.js';
import { Message, LLMAdapter } from '../types.js';

// ── Helper ──

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: crypto.randomUUID(),
    threadId: 'thread-1',
    role: 'user',
    content: 'Hello world',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeLLMAdapter(overrides: Partial<LLMAdapter> = {}): LLMAdapter {
  return {
    chat: vi.fn().mockResolvedValue('mock reply'),
    extractMemories: vi.fn().mockResolvedValue([]),
    embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
    ...overrides,
  };
}

// ── classifySource ──

describe('classifySource', () => {
  it('returns "confirmed" for user messages', () => {
    expect(classifySource('user')).toBe('confirmed');
  });

  it('returns "inferred" for assistant messages', () => {
    expect(classifySource('assistant')).toBe('inferred');
  });

  it('returns "inferred" for system messages', () => {
    expect(classifySource('system')).toBe('inferred');
  });
});

// ── extractMemories (LLM-based) ──

describe('extractMemories', () => {
  it('returns empty array for empty messages', async () => {
    const llm = makeLLMAdapter();
    const result = await extractMemories([], llm);
    expect(result).toEqual([]);
    expect(llm.extractMemories).not.toHaveBeenCalled();
  });

  it('calls llm.extractMemories with the messages', async () => {
    const messages = [
      makeMessage({ content: 'I prefer TypeScript', role: 'user' }),
      makeMessage({ content: 'Noted!', role: 'assistant' }),
    ];
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'Prefers TypeScript', source: 'confirmed' },
      ]),
    });

    const result = await extractMemories(messages, llm);

    expect(llm.extractMemories).toHaveBeenCalledWith(messages, undefined);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ content: 'Prefers TypeScript', source: 'confirmed' });
    expect(result[0].tags).toBeDefined();
  });

  it('filters out empty content from LLM results', async () => {
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'Valid fact', source: 'confirmed' },
        { content: '', source: 'confirmed' },
        { content: '   ', source: 'inferred' },
      ]),
    });

    const result = await extractMemories([makeMessage()], llm);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Valid fact');
  });

  it('trims whitespace from extracted content', async () => {
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: '  Prefers Python  ', source: 'confirmed' },
      ]),
    });

    const result = await extractMemories([makeMessage()], llm);
    expect(result[0].content).toBe('Prefers Python');
  });

  it('normalizes invalid source values to "inferred"', async () => {
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'Some fact', source: 'unknown' as any },
        { content: 'Another fact', source: 'confirmed' },
      ]),
    });

    const result = await extractMemories([makeMessage()], llm);
    expect(result[0].source).toBe('inferred');
    expect(result[1].source).toBe('confirmed');
  });

  it('preserves both confirmed and inferred sources', async () => {
    const llm = makeLLMAdapter({
      extractMemories: vi.fn().mockResolvedValue([
        { content: 'User stated fact', source: 'confirmed' },
        { content: 'Assistant deduced fact', source: 'inferred' },
      ]),
    });

    const result = await extractMemories([makeMessage()], llm);
    expect(result).toHaveLength(2);
    expect(result[0].source).toBe('confirmed');
    expect(result[1].source).toBe('inferred');
  });
});

// ── extractFactsSimple (rule-based fallback) ──

describe('extractFactsSimple', () => {
  it('returns empty array for no messages', () => {
    expect(extractFactsSimple([])).toEqual([]);
  });

  it('skips system messages', () => {
    const messages = [makeMessage({ role: 'system', content: 'You are a helpful assistant. I am the system.' })];
    expect(extractFactsSimple(messages)).toEqual([]);
  });

  it('extracts facts from user messages as "confirmed"', () => {
    const messages = [
      makeMessage({
        role: 'user',
        content: 'I prefer TypeScript for backend work. I also use React.',
      }),
    ];

    const facts = extractFactsSimple(messages);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.source === 'confirmed')).toBe(true);
  });

  it('extracts facts from assistant messages as "inferred"', () => {
    const messages = [
      makeMessage({
        role: 'assistant',
        content: 'Based on what you said, I understand you prefer TypeScript.',
      }),
    ];

    const facts = extractFactsSimple(messages);
    // The heuristic matches "I understand you prefer" since it contains "I" and "prefer"
    expect(facts.every((f) => f.source === 'inferred')).toBe(true);
  });

  it('filters out short sentences (<=10 chars)', () => {
    const messages = [
      makeMessage({
        role: 'user',
        content: 'I do. I prefer TypeScript for all my projects.',
      }),
    ];

    const facts = extractFactsSimple(messages);
    // "I do" is too short and should be filtered
    for (const fact of facts) {
      expect(fact.content.length).toBeGreaterThan(10);
    }
  });

  it('handles multiple messages from mixed roles', () => {
    const messages = [
      makeMessage({ role: 'user', content: 'I work in fintech and I use Python daily.' }),
      makeMessage({ role: 'assistant', content: 'I can see that you have experience with financial data.' }),
    ];

    const facts = extractFactsSimple(messages);
    const confirmed = facts.filter((f) => f.source === 'confirmed');
    const inferred = facts.filter((f) => f.source === 'inferred');

    expect(confirmed.length).toBeGreaterThan(0);
    // The assistant message may or may not match the heuristic
    expect(facts.length).toBeGreaterThan(0);
  });
});
