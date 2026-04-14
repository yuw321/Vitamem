import { describe, it, expect, vi } from 'vitest';
import { reflectOnExtraction, applyReflectionResult } from './reflection.js';
import { ExtractedFact } from './extraction.js';
import { ReflectionResult } from '../types.js';

// ── Helpers ──

function makeLLM(chatResponse: string | Error) {
  return {
    chat: chatResponse instanceof Error
      ? vi.fn().mockRejectedValue(chatResponse)
      : vi.fn().mockResolvedValue(chatResponse),
  };
}

function makeFacts(overrides: Partial<ExtractedFact>[] = []): ExtractedFact[] {
  const defaults: ExtractedFact[] = [
    { content: 'User takes metformin 500mg', source: 'confirmed', tags: ['medication'] },
    { content: 'User has type 2 diabetes', source: 'confirmed', tags: ['condition'] },
  ];
  if (overrides.length === 0) return defaults;
  return overrides.map((o, i) => ({ ...defaults[i % defaults.length], ...o }));
}

const existingMemories = [
  { content: 'User has high blood pressure', source: 'confirmed' },
  { content: 'User prefers morning appointments', source: 'inferred' },
];

const originalMessages = [
  { role: 'user', content: 'I take metformin 500mg for my type 2 diabetes' },
  { role: 'assistant', content: 'I see, I will note that.' },
];

// ── reflectOnExtraction ──

describe('reflectOnExtraction', () => {
  it('returns facts unchanged when LLM confirms all (no conflicts)', async () => {
    const llmResponse: ReflectionResult = {
      correctedFacts: [
        { content: 'User takes metformin 500mg', source: 'confirmed', action: 'keep' },
        { content: 'User has type 2 diabetes', source: 'confirmed', action: 'keep' },
      ],
      missedFacts: [],
      conflicts: [],
    };
    const llm = makeLLM(JSON.stringify(llmResponse));

    const result = await reflectOnExtraction(makeFacts(), existingMemories, originalMessages, llm);

    expect(result.correctedFacts).toHaveLength(2);
    expect(result.correctedFacts.every(f => f.action === 'keep')).toBe(true);
    expect(result.missedFacts).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
    expect(llm.chat).toHaveBeenCalledOnce();
  });

  it('enriches a vague fact with more context', async () => {
    const llmResponse: ReflectionResult = {
      correctedFacts: [
        { content: 'User takes metformin 500mg daily for type 2 diabetes management', source: 'confirmed', action: 'enrich', reason: 'Added dosage context from conversation' },
        { content: 'User has type 2 diabetes', source: 'confirmed', action: 'keep' },
      ],
      missedFacts: [],
      conflicts: [],
    };
    const llm = makeLLM(JSON.stringify(llmResponse));

    const result = await reflectOnExtraction(makeFacts(), existingMemories, originalMessages, llm);

    expect(result.correctedFacts[0].action).toBe('enrich');
    expect(result.correctedFacts[0].content).toContain('daily');
    expect(result.correctedFacts[0].reason).toBeDefined();
  });

  it('catches a missed fact from the conversation', async () => {
    const llmResponse: ReflectionResult = {
      correctedFacts: [
        { content: 'User takes metformin 500mg', source: 'confirmed', action: 'keep' },
        { content: 'User has type 2 diabetes', source: 'confirmed', action: 'keep' },
      ],
      missedFacts: [
        { content: 'User takes metformin specifically for diabetes', source: 'inferred', tags: ['medication', 'condition'] },
      ],
      conflicts: [],
    };
    const llm = makeLLM(JSON.stringify(llmResponse));

    const result = await reflectOnExtraction(makeFacts(), existingMemories, originalMessages, llm);

    expect(result.missedFacts).toHaveLength(1);
    expect(result.missedFacts[0].content).toContain('metformin');
    expect(result.missedFacts[0].source).toBe('inferred');
  });

  it('detects conflict with existing memory', async () => {
    const llmResponse: ReflectionResult = {
      correctedFacts: [
        { content: 'User takes metformin 500mg', source: 'confirmed', action: 'keep' },
        { content: 'User has type 2 diabetes', source: 'confirmed', action: 'keep' },
      ],
      missedFacts: [],
      conflicts: [
        {
          newFact: 'User has normal blood pressure',
          existingMemory: 'User has high blood pressure',
          resolution: 'keep_new',
        },
      ],
    };
    const llm = makeLLM(JSON.stringify(llmResponse));

    const result = await reflectOnExtraction(makeFacts(), existingMemories, originalMessages, llm);

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].resolution).toBe('keep_new');
    expect(result.conflicts[0].existingMemory).toContain('high blood pressure');
  });

  it('returns original facts when LLM returns invalid JSON (graceful failure)', async () => {
    const llm = makeLLM('This is not valid JSON at all!!!');

    const facts = makeFacts();
    const result = await reflectOnExtraction(facts, existingMemories, originalMessages, llm);

    // Should fall back to original facts
    expect(result.correctedFacts).toHaveLength(2);
    expect(result.correctedFacts[0].content).toBe('User takes metformin 500mg');
    expect(result.correctedFacts[0].action).toBe('keep');
    expect(result.missedFacts).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it('returns original facts when LLM call throws an error', async () => {
    const llm = makeLLM(new Error('LLM service unavailable'));

    const facts = makeFacts();
    const result = await reflectOnExtraction(facts, existingMemories, originalMessages, llm);

    expect(result.correctedFacts).toHaveLength(2);
    expect(result.correctedFacts[0].action).toBe('keep');
    expect(result.missedFacts).toHaveLength(0);
  });

  it('handles LLM response wrapped in markdown code fences', async () => {
    const llmResponse: ReflectionResult = {
      correctedFacts: [
        { content: 'User takes metformin 500mg', source: 'confirmed', action: 'keep' },
      ],
      missedFacts: [],
      conflicts: [],
    };
    const llm = makeLLM('```json\n' + JSON.stringify(llmResponse) + '\n```');

    const result = await reflectOnExtraction(
      makeFacts([{ content: 'User takes metformin 500mg', source: 'confirmed' }]),
      existingMemories,
      originalMessages,
      llm,
    );

    expect(result.correctedFacts).toHaveLength(1);
    expect(result.correctedFacts[0].action).toBe('keep');
  });

  it('uses custom prompt when provided', async () => {
    const customPrompt = 'You are a custom reviewer. Return JSON.';
    const llmResponse: ReflectionResult = {
      correctedFacts: [
        { content: 'User takes metformin 500mg', source: 'confirmed', action: 'keep' },
      ],
      missedFacts: [],
      conflicts: [],
    };
    const llm = makeLLM(JSON.stringify(llmResponse));

    await reflectOnExtraction(
      makeFacts([{ content: 'User takes metformin 500mg', source: 'confirmed' }]),
      existingMemories,
      originalMessages,
      llm,
      customPrompt,
    );

    // The custom prompt should be sent as the system message
    const callArgs = llm.chat.mock.calls[0][0];
    expect(callArgs[0].role).toBe('system');
    expect(callArgs[0].content).toBe(customPrompt);
  });
});

// ── applyReflectionResult ──

describe('applyReflectionResult', () => {
  it('keeps facts with action "keep" and "enrich"', () => {
    const result: ReflectionResult = {
      correctedFacts: [
        { content: 'Fact A', source: 'confirmed', action: 'keep' },
        { content: 'Enriched Fact B', source: 'inferred', action: 'enrich' },
        { content: 'Bad Fact C', source: 'inferred', action: 'remove' },
      ],
      missedFacts: [],
      conflicts: [],
    };

    const facts = applyReflectionResult(result);
    expect(facts).toHaveLength(2);
    expect(facts[0].content).toBe('Fact A');
    expect(facts[1].content).toBe('Enriched Fact B');
  });

  it('appends missed facts after corrected facts', () => {
    const result: ReflectionResult = {
      correctedFacts: [
        { content: 'Fact A', source: 'confirmed', action: 'keep' },
      ],
      missedFacts: [
        { content: 'Missed Fact X', source: 'inferred', tags: ['general'] },
      ],
      conflicts: [],
    };

    const facts = applyReflectionResult(result);
    expect(facts).toHaveLength(2);
    expect(facts[0].content).toBe('Fact A');
    expect(facts[1].content).toBe('Missed Fact X');
    expect(facts[1].source).toBe('inferred');
  });

  it('removes all facts with action "remove"', () => {
    const result: ReflectionResult = {
      correctedFacts: [
        { content: 'Remove me', source: 'inferred', action: 'remove' },
      ],
      missedFacts: [],
      conflicts: [],
    };

    const facts = applyReflectionResult(result);
    expect(facts).toHaveLength(0);
  });

  it('preserves profile fields through reflection', () => {
    const result: ReflectionResult = {
      correctedFacts: [
        {
          content: 'A1C is 7.2%',
          source: 'confirmed',
          action: 'keep',
          profileField: 'vitals',
          profileKey: 'a1c',
          profileValue: '7.2',
          profileUnit: '%',
        },
      ],
      missedFacts: [],
      conflicts: [],
    };

    const facts = applyReflectionResult(result);
    expect(facts).toHaveLength(1);
    expect(facts[0].profileField).toBe('vitals');
    expect(facts[0].profileKey).toBe('a1c');
    expect(facts[0].profileValue).toBe('7.2');
  });
});
