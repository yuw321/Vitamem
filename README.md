<p align="center">
  <img src="https://raw.githubusercontent.com/yuw321/Vitamem/main/website/public/brand/logo-concept-a.svg" alt="Vitamem" width="120" />
</p>

<h1 align="center">Vitamem</h1>

<p align="center">
  <strong>Lifecycle-aware long-term memory for AI.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vitamem"><img src="https://img.shields.io/npm/v/vitamem.svg" alt="npm version" /></a>
  <a href="https://github.com/yuw321/Vitamem/actions"><img src="https://img.shields.io/github/actions/workflow/status/yuw321/Vitamem/ci.yml?label=tests" alt="tests" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/yuw321/Vitamem/discussions"><img src="https://img.shields.io/badge/discussions-GitHub-blue" alt="GitHub Discussions" /></a>
  <a href="ROADMAP.md"><img src="https://img.shields.io/badge/roadmap-view-brightgreen" alt="Roadmap" /></a>
</p>

> **Developer Preview** — Vitamem's core API is stable. We are actively
> working on operational hardening. See the [Roadmap](ROADMAP.md) and
> [open issues](https://github.com/yuw321/Vitamem/issues) for what's next.

---

Conversations have a lifecycle. Vitamem tracks it — extracting what matters when sessions rest, deduplicating against what's already known, and recalling it when users return.

Most memory libraries embed every message as it arrives, producing noisy stores and redundant entries. Vitamem waits until a session goes dormant, then extracts structured facts, embeds them once, and deduplicates. This means **~8x fewer embedding calls**, **cleaner memories**, and **selective retrieval** that sends only relevant context to the LLM — not the entire store. Whether you're building a health companion, coaching assistant, tutoring system, or support agent, Vitamem gives your AI persistent memory with a single config object.

## How It Works

Every conversation thread moves through four lifecycle states:

```
Active → Cooling → Dormant → Closed
  💬        ⏳        🧠        📦
```

| State | What happens |
|-------|-------------|
| **Active** | Conversation is live. Messages are stored in full. No embeddings yet — wasteful mid-session. |
| **Cooling** | Session paused. A timer starts (default: 6 hours). A new message brings the thread back to Active. |
| **Dormant** | The key transition. Facts are extracted from the conversation, deduplicated against existing memories, and **embeddings are computed once** on the compressed result. |
| **Closed** | Thread archived. Extracted memories live on and remain searchable indefinitely. |

Embeddings are computed **once per thread** at dormant transition — not on every message. A 50-message thread typically yields 5–8 extracted facts, meaning **~8x fewer embedding calls** than naive per-message approaches. Combined with selective retrieval that sends only relevant context to the LLM, this significantly reduces token costs per chat.

## Use Cases

- **Health companions** — remembers symptoms, medications, conditions, and health goals across sessions
- **Coaching assistants** — tracks goals, progress, and setbacks over time
- **Tutoring systems** — knows what students understand, where they struggle, and what they've mastered
- **Support agents** — recalls customer context, issue history, and preferences

## Install

```bash
npm install vitamem
```

Install a provider SDK (peer dependency):

```bash
# OpenAI (also works with Ollama, vLLM, LM Studio)
npm install openai

# Anthropic (also requires openai for embeddings)
npm install @anthropic-ai/sdk openai
```

## Quick Start

```typescript
import { createVitamem } from 'vitamem';

// 1. Initialize — 3 lines
const mem = await createVitamem({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  storage: 'ephemeral',
});

// 2. Start a conversation
const thread = await mem.createThread({ userId: 'user-123' });

const { reply } = await mem.chat({
  threadId: thread.id,
  message: "I prefer dark mode, use TypeScript, and deploy on Vercel.",
});

// 3. Session rests → extract facts, embed once, deduplicate, save
await mem.triggerDormantTransition(thread.id);

// 4. Next session — relevant memories appear automatically
const newThread = await mem.createThread({ userId: 'user-123' });
const { reply: reply2 } = await mem.chat({
  threadId: newThread.id,
  message: "What tools do I use?",
});
// Vitamem auto-retrieves: "Prefers TypeScript", "Deploys on Vercel", ...
```

### Local Models (Ollama)

```typescript
const mem = await createVitamem({
  provider: 'ollama',
  storage: 'ephemeral',
});
// Uses llama3.2 + nomic-embed-text on localhost:11434 — zero config
```

### Auto-Retrieve (Memory-Aware Chat)

```typescript
const mem = await createVitamem({
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  storage: 'ephemeral',
  autoRetrieve: true, // memories automatically injected into chat context
});

const { reply, memories } = await mem.chat({
  threadId: thread.id,
  message: "What were my preferences again?",
});
// memories: the retrieved memories that were used (for transparency)
```

## Key Features

- **Lifecycle-aware threads** — Active → Cooling → Dormant → Closed with configurable timeouts. Automatically reactivates when users return.
- **Smart memory extraction** — Facts are pulled from both user and assistant messages when a thread goes dormant. No manual tagging.
- **Temporal encoding** — Facts include the date they were learned, enabling temporal reasoning (e.g., "Prefers TypeScript (mentioned 2024-01-15)").
- **Active forgetting** — Memory relevance naturally decays over time; pinned memories are exempt.
- **Reflection pass** — Optional second LLM call validates extraction quality and catches contradictions.
- **Priority signaling** — Memories tagged `[CRITICAL]`/`[IMPORTANT]`/`[INFO]` to guide LLM attention.
- **Cache-friendly context** — Stable prefix + dynamic suffix enables LLM prompt caching.
- **Lower cost** — Selective retrieval means fewer tokens per LLM call, plus ~8x fewer embedding calls through lifecycle batching.
- **Semantic deduplication** — Cosine similarity prevents redundant memories. Genuinely new facts are preserved.
- **Built-in provider adapters** — OpenAI, Anthropic, Ollama (local models) out of the box. Or bring your own.
- **Auto-retrieve** — Optionally inject relevant memories into chat context automatically.
- **Lifecycle sweeping** — `sweepThreads()` handles all state transitions on a schedule. Your app just calls it on a timer.
- **GDPR-ready** — `deleteMemory()` and `deleteUserData()` for right to erasure.
- **Pluggable storage** — `'ephemeral'` for dev, `'supabase'` for production, or bring your own `StorageAdapter`.
- **Configurable concurrency** — Control how many embedding API calls run in parallel.
- **Zero production dependencies** — No hidden supply chain risk. Provider SDKs are optional peer dependencies.

## Architecture

```
  User message
       │
       ▼
  ┌─────────┐    timeout    ┌─────────┐    timeout    ┌─────────┐
  │  Active  │ ──────────►  │ Cooling │ ──────────►  │ Dormant │
  │  (live)  │ ◄────────── │ (paused) │              │(extract)│
  └─────────┘  new message  └─────────┘              └────┬────┘
                                                          │
                                          extract → embed → dedup → save
                                                          │
                                                          ▼
                                                     ┌─────────┐
                                                     │ Closed  │
                                                     │(archive)│
                                                     └─────────┘
```

## Configuration

```typescript
const mem = await createVitamem({
  // Provider — string shortcut OR adapter instance
  provider: 'openai',           // 'openai' | 'anthropic' | 'ollama'
  apiKey: '...',                // required for openai/anthropic
  model: 'gpt-5.4-mini',       // optional, sensible defaults per provider
  // OR: llm: createOllamaAdapter({ model: 'mistral' }),

  // Storage — string shortcut OR adapter instance
  storage: 'ephemeral',         // 'ephemeral' | 'supabase' | StorageAdapter
  // supabaseUrl: '...',        // required if storage: 'supabase'
  // supabaseKey: '...',

  // Behavioral settings (all optional)
  coolingTimeoutMs: 6 * 60 * 60 * 1000,  // default: 6 hours
  closedTimeoutMs: 30 * 24 * 3600000,    // default: 30 days
  embeddingConcurrency: 5,                // default: 5
  autoRetrieve: false,                    // default: false

  // Phase 1: Cognitive Memory (optional)
  // enableReflection: true,
  // forgetting: {
  //   forgettingHalfLifeMs: 180 * 86400000,  // 180 days
  //   minRetrievalScore: 0.1,
  // },
  // prioritySignaling: true,
  // chronologicalRetrieval: true,
  // cacheableContext: false,
});
```

## Documentation

Full documentation at **[vitamem.dev](https://vitamem.dev)** — quickstart, API reference, provider guides, tutorials, and more.

Documentation is built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build). To preview locally:

```bash
cd website && npm run dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions welcome.

## Disclaimer

Vitamem is a developer library for AI memory management, not a medical device. If you build health-related applications, you are responsible for compliance (HIPAA, GDPR, etc.) and safety disclosures. See [full disclaimer](https://vitamem.dev/legal/disclaimer/).

## License

[MIT](LICENSE)
