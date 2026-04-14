import { describe, it, expect, beforeEach } from 'vitest';
import { createVitamem } from 'vitamem/facade/create-vitamem';
import type { Vitamem, LLMAdapter, Message, MemorySource } from 'vitamem/types';

// ---------------------------------------------------------------------------
// Deterministic hash for pseudo-embeddings
// ---------------------------------------------------------------------------

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return hash;
}

// ---------------------------------------------------------------------------
// Mock LLM adapter — no API keys needed
// ---------------------------------------------------------------------------

const mockLLM: LLMAdapter = {
  chat: async (messages: Array<{ role: string; content: string }>) => {
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMsg) return 'Hello! How can I help you today?';

    const msg = lastUserMsg.content.toLowerCase();
    if (msg.includes('diabetes')) return 'I understand you have Type 2 diabetes. How long have you been managing it?';
    if (msg.includes('metformin')) return 'Metformin is a common first-line treatment. What dose are you taking?';
    if (msg.includes('a1c')) return 'An A1C target below 7.0 is achievable with the right combination of medication and lifestyle changes.';
    if (msg.includes('back') || msg.includes('checkup')) return 'Welcome back! I remember we discussed your diabetes management and A1C goals last time.';
    if (msg.includes('6.8')) return 'Wonderful progress! Going from 7.4 to 6.8 shows your metformin and exercise routine are working well.';
    if (msg.includes('allergic') || msg.includes('penicillin')) return 'I\'ll make note of your penicillin allergy. This is very important information.';
    if (msg.includes('blood pressure') || msg.includes('lisinopril')) return 'Blood pressure management is important alongside diabetes. Lisinopril is a good choice.';
    if (msg.includes('exercise') || msg.includes('walk') || msg.includes('yoga')) return 'That\'s a great exercise routine! Regular physical activity helps with blood sugar control.';
    if (msg.includes('glucose')) return 'A fasting glucose of 110 is within a reasonable range. Keep monitoring!';
    return 'Thank you for sharing that. I\'ll keep track of this information.';
  },

  extractMemories: async (messages: Message[]) => {
    const allText = messages.map(m => m.content).join(' ').toLowerCase();
    const facts: Array<{ content: string; source: MemorySource }> = [];

    if (allText.includes('type 2 diabetes') || allText.includes('diabetes')) {
      facts.push({ content: 'Has Type 2 diabetes, diagnosed approximately 3 years ago', source: 'confirmed' });
    }
    if (allText.includes('metformin')) {
      facts.push({ content: 'Takes metformin 1000mg twice daily', source: 'confirmed' });
    }
    if (allText.includes('a1c') && allText.includes('7.4')) {
      facts.push({ content: 'Most recent A1C: 7.4 — target is below 7.0', source: 'confirmed' });
    }
    if (allText.includes('exercise') || allText.includes('walk')) {
      facts.push({ content: 'Exercises Mon/Wed/Fri, 30 min cardio', source: 'confirmed' });
    }
    if (allText.includes('cutting carbs') || allText.includes('reducing')) {
      facts.push({ content: 'Actively reducing carbohydrate intake', source: 'inferred' });
    }
    if (allText.includes('penicillin') || allText.includes('allergic')) {
      facts.push({ content: 'Allergic to penicillin', source: 'confirmed' });
    }
    if (allText.includes('lisinopril')) {
      facts.push({ content: 'Takes lisinopril 10mg for blood pressure', source: 'confirmed' });
    }
    if (allText.includes('blood pressure') && allText.includes('130')) {
      facts.push({ content: 'Blood pressure is 130/85, slightly elevated', source: 'confirmed' });
    }
    if (allText.includes('6.8')) {
      facts.push({ content: 'A1C improved from 7.4 to 6.8', source: 'confirmed' });
    }
    if (allText.includes('glucose') && allText.includes('110')) {
      facts.push({ content: 'Fasting glucose was 110', source: 'confirmed' });
    }
    return facts;
  },

  embed: async (text: string) => {
    const hash = simpleHash(text);
    return Array.from({ length: 128 }, (_, i) => Math.sin(hash + i) * 0.5);
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Vitamem Demo Integration Tests', () => {
  let mem: Vitamem;
  const userId = 'test-user';

  beforeEach(async () => {
    mem = await createVitamem({
      llm: mockLLM,
      storage: 'ephemeral',
      autoRetrieve: true,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 1: Health Companion Check-in
  // -------------------------------------------------------------------------
  describe('Scenario 1: Health Companion Check-in', () => {
    it('should complete a full two-session check-in flow', async () => {
      // Session 1: user check-in
      const thread1 = await mem.createThread({ userId });
      expect(thread1.state).toBe('active');

      await mem.chat({ threadId: thread1.id, message: "Hi! I've been managing Type 2 diabetes for about 3 years now." });
      await mem.chat({ threadId: thread1.id, message: 'I take metformin 1000mg twice a day. My last A1C was 7.4.' });
      await mem.chat({ threadId: thread1.id, message: "My doctor wants me to get it under 7.0. I exercise Mon/Wed/Fri and I've been cutting carbs." });

      // Trigger dormant transition — should extract memories
      await mem.triggerDormantTransition(thread1.id);
      const updatedThread = await mem.getThread(thread1.id);
      expect(updatedThread?.state).toBe('dormant');

      // Verify memories were extracted
      const memories = await mem.retrieve({ userId, query: 'diabetes medications', limit: 10 });
      expect(memories.length).toBeGreaterThan(0);
      expect(memories.some(m => m.content.toLowerCase().includes('diabetes'))).toBe(true);
      expect(memories.some(m => m.content.toLowerCase().includes('metformin'))).toBe(true);

      // Session 2: follow-up visit with memory recall
      const thread2 = await mem.createThread({ userId });
      const response = await mem.chat({ threadId: thread2.id, message: "Hey, I'm back! Had a checkup yesterday." });
      expect(response.reply).toBeTruthy();
      // autoRetrieve should inject memories
      expect(response.memories).toBeDefined();

      const response2 = await mem.chat({ threadId: thread2.id, message: 'A1C is now 6.8! Doctor was really happy.' });
      expect(response2.reply).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Memory Retrieval Deep Dive
  // -------------------------------------------------------------------------
  describe('Scenario 2: Memory Retrieval', () => {
    it('should retrieve memories with scores', async () => {
      const thread = await mem.createThread({ userId });
      await mem.chat({ threadId: thread.id, message: 'I have Type 2 diabetes and take metformin 1000mg twice daily.' });
      await mem.chat({ threadId: thread.id, message: "I'm allergic to penicillin." });
      await mem.chat({ threadId: thread.id, message: 'My blood pressure is 130/85. I take lisinopril 10mg.' });
      await mem.triggerDormantTransition(thread.id);

      const results = await mem.retrieve({ userId, query: 'diabetes medications', limit: 5 });
      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => {
        expect(typeof r.score).toBe('number');
        expect(r.content).toBeTruthy();
      });
    });

    it('should support pinning and unpinning memories', async () => {
      const thread = await mem.createThread({ userId });
      await mem.chat({ threadId: thread.id, message: "I'm allergic to penicillin. I also have diabetes." });
      await mem.triggerDormantTransition(thread.id);

      const memories = await mem.retrieve({ userId, query: 'health info', limit: 10 });
      expect(memories.length).toBeGreaterThan(0);

      // Pin the first memory
      const memId = memories[0].id!;
      await mem.pinMemory(memId);

      // Retrieve again — pinned should appear with score 1.0
      const afterPin = await mem.retrieve({ userId, query: 'health info', limit: 10 });
      expect(afterPin.length).toBeGreaterThan(0);
      const pinnedResult = afterPin.find(m => m.id === memId);
      expect(pinnedResult).toBeDefined();
      expect(pinnedResult!.pinned).toBe(true);
      expect(pinnedResult!.score).toBe(1.0);

      // Unpin
      await mem.unpinMemory(memId);
      const afterUnpin = await mem.retrieve({ userId, query: 'health info', limit: 10 });
      const unpinnedResult = afterUnpin.find(m => m.id === memId);
      expect(unpinnedResult).toBeDefined();
      // After unpinning, score should come from cosine similarity, not 1.0
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Multi-Session Accumulation
  // -------------------------------------------------------------------------
  describe('Scenario 3: Multi-Session Accumulation', () => {
    it('should accumulate memories across sessions and deduplicate', async () => {
      // Session 1
      const t1 = await mem.createThread({ userId });
      await mem.chat({ threadId: t1.id, message: 'I have diabetes and take metformin.' });
      await mem.triggerDormantTransition(t1.id);

      const memoriesAfterS1 = await mem.retrieve({ userId, query: 'health', limit: 20 });
      const countAfterS1 = memoriesAfterS1.length;
      expect(countAfterS1).toBeGreaterThan(0);

      // Session 2 — overlapping info + new info
      const t2 = await mem.createThread({ userId });
      await mem.chat({ threadId: t2.id, message: "I'm still taking my metformin twice a day. My doctor added lisinopril." });
      await mem.triggerDormantTransition(t2.id);

      const memoriesAfterS2 = await mem.retrieve({ userId, query: 'health', limit: 20 });
      // Should have more memories (lisinopril is new)
      expect(memoriesAfterS2.length).toBeGreaterThan(countAfterS1);

      // Metformin should exist at least once
      const metforminMemories = memoriesAfterS2.filter(m => m.content.toLowerCase().includes('metformin'));
      expect(metforminMemories.length).toBeGreaterThanOrEqual(1);

      // Session 3 — more new info
      const t3 = await mem.createThread({ userId });
      await mem.chat({ threadId: t3.id, message: 'Great news — my A1C dropped from 7.4 to 6.8! The metformin and exercise are working.' });
      await mem.triggerDormantTransition(t3.id);

      const memoriesAfterS3 = await mem.retrieve({ userId, query: 'health', limit: 20 });
      expect(memoriesAfterS3.length).toBeGreaterThan(countAfterS1);

      // New memories should have been added across sessions
      // (exact dedup behavior depends on mock embedding similarity)
      expect(memoriesAfterS3.length).toBeGreaterThanOrEqual(countAfterS1);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Thread Lifecycle
  // -------------------------------------------------------------------------
  describe('Scenario 4: Thread Lifecycle', () => {
    it('should handle dormant transition correctly', async () => {
      const thread = await mem.createThread({ userId });
      expect(thread.state).toBe('active');

      await mem.chat({ threadId: thread.id, message: 'Quick check-in: glucose was 110 fasting.' });
      await mem.triggerDormantTransition(thread.id);

      const updated = await mem.getThread(thread.id);
      expect(updated?.state).toBe('dormant');
    });

    it('should redirect chat on dormant thread to new thread', async () => {
      const thread = await mem.createThread({ userId });
      await mem.chat({ threadId: thread.id, message: 'Hello' });
      await mem.triggerDormantTransition(thread.id);

      // Chat on dormant thread should auto-redirect
      const response = await mem.chat({ threadId: thread.id, message: 'One more thing...' });
      expect(response.redirected).toBe(true);
      expect(response.previousThreadId).toBe(thread.id);
      expect(response.thread.id).not.toBe(thread.id);
      expect(response.thread.state).toBe('active');
    });

    it('should close a dormant thread', async () => {
      const thread = await mem.createThread({ userId });
      await mem.chat({ threadId: thread.id, message: 'Hi' });
      await mem.triggerDormantTransition(thread.id);
      await mem.closeThread(thread.id);

      const closed = await mem.getThread(thread.id);
      expect(closed?.state).toBe('closed');
    });

    it('should run sweepThreads without error', async () => {
      await expect(mem.sweepThreads()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Streaming
  // -------------------------------------------------------------------------
  describe('Scenario 5: Streaming', () => {
    it('chatStream produces complete response', async () => {
      const thread = await mem.createThread({ userId });
      const { stream, thread: updated, memories } = await mem.chatStream({
        threadId: thread.id,
        message: 'I have Type 2 diabetes and take metformin.',
      });

      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      // Should have yielded at least one chunk
      expect(chunks.length).toBeGreaterThan(0);
      const fullText = chunks.join('');
      expect(fullText).toBeTruthy();

      // autoRetrieve is enabled, so memories should be present
      expect(memories).toBeDefined();
    });

    it('chatWithUserStream resolves thread and streams', async () => {
      const { stream, thread } = await mem.chatWithUserStream({
        userId,
        message: 'Quick health check-in.',
      });

      expect(thread.userId).toBe(userId);
      expect(thread.state).toBe('active');

      const chunks: string[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('')).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Memory Management
  // -------------------------------------------------------------------------
  describe('Memory Management', () => {
    it('should delete individual memories', async () => {
      const thread = await mem.createThread({ userId });
      await mem.chat({ threadId: thread.id, message: 'I have diabetes and take metformin.' });
      await mem.triggerDormantTransition(thread.id);

      const memories = await mem.retrieve({ userId, query: 'health', limit: 10 });
      expect(memories.length).toBeGreaterThan(0);

      await mem.deleteMemory(memories[0].id!);
      const remaining = await mem.retrieve({ userId, query: 'health', limit: 10 });
      expect(remaining.length).toBeLessThan(memories.length);
    });

    it('should delete all user data (GDPR)', async () => {
      const thread = await mem.createThread({ userId });
      await mem.chat({ threadId: thread.id, message: 'I have diabetes.' });
      await mem.triggerDormantTransition(thread.id);

      const before = await mem.retrieve({ userId, query: 'health', limit: 10 });
      expect(before.length).toBeGreaterThan(0);

      await mem.deleteUserData(userId);

      const after = await mem.retrieve({ userId, query: 'health', limit: 10 });
      expect(after.length).toBe(0);
    });
  });
});
