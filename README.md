<p align="center">
  <img src="docs/brand/logo-final.png" alt="vitamem" width="120" />
</p>

<h1 align="center">Vitamem</h1>

<p align="center">
  <strong>Memory for AI health companions — built around how care relationships actually work.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/vitamem"><img src="https://img.shields.io/npm/v/vitamem.svg" alt="npm version" /></a>
  <a href="https://github.com/yuw321/Vitamem/actions"><img src="https://img.shields.io/github/actions/workflow/status/yuw321/Vitamem/ci.yml?label=tests" alt="tests" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/yuw321/Vitamem/discussions"><img src="https://img.shields.io/badge/discussions-GitHub-blue" alt="GitHub Discussions" /></a>
</p>

---

Most memory libraries treat every message the same — embedding every interaction, storing everything equally. Vitamem is different. It models the natural rhythm of care relationships: an active check-in, a quiet period between sessions, a long dormant break, and eventual closure.

This makes Vitamem the right choice for AI health companions, wellness chatbots, and counseling assistants — AI that talks to users like a friend who actually remembers them.

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

Embeddings are computed **once per thread** at dormant transition — not on every message. A 50-message thread typically yields 5–8 extracted facts, meaning **5–20x fewer embedding calls** than naive per-message approaches.

## Use Cases

- **AI health companions** — remembers symptoms, medications, conditions, and health goals across sessions
- **Counseling assistants** — maintains emotional context, tracks progress, and naturally recalls what matters
- **Wellness apps** — builds a rich user model over time without expensive per-message processing
- **Chronic condition trackers** — captures health history that persists across long gaps between check-ins

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

// 2. Start a health companion session
const thread = await mem.createThread({ userId: 'user-123' });

const { reply } = await mem.chat({
  threadId: thread.id,
  message: "I've been managing Type 2 diabetes for 3 years. I take metformin daily.",
});
// AI responds naturally, facts stored

// 3. After the session goes quiet, extract and embed memories
await mem.triggerDormantTransition(thread.id);

// 4. Later — retrieve memories to enrich a new conversation
const memories = await mem.retrieve({
  userId: 'user-123',
  query: 'health conditions and medications',
});
// [{ content: 'Has Type 2 diabetes', source: 'confirmed', score: 0.96 }, ...]
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
  message: "How's my blood sugar doing?",
});
// memories: the retrieved memories that were used (for transparency)
```

## Key Features

- **Lifecycle-aware threads** — Active → Cooling → Dormant → Closed with configurable timeouts. Automatically reactivates when users return.
- **Health-context memory extraction** — Facts are pulled from both user and assistant messages when a thread goes dormant. No manual tagging.
- **5–20x fewer embedding calls** — Computed once at dormant transition on extracted facts, not on every message or at search time.
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
});
```

## Documentation

Full documentation at **[vitamem.dev](https://vitamem.dev)** — quickstart, API reference, provider guides, health companion tutorial, and more.

Documentation is built with [Astro](https://astro.build) + [Starlight](https://starlight.astro.build). To preview locally:

```bash
cd website && npm run dev
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributions welcome.

## Disclaimer

Vitamem is a developer library for memory management, not a medical device. It is not intended to diagnose, treat, cure, or prevent any medical condition. Applications using Vitamem are responsible for their own privacy policies, compliance requirements, and safety disclosures. See [full disclaimer](https://vitamem.dev/legal/disclaimer/).

## License

[MIT](LICENSE)
