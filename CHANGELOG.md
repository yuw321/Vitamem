# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Temporal Encoding** — Session dates embedded in extracted facts (e.g., "Has Type 2 diabetes (mentioned 2024-01-15)")
  - `extractMemories()` accepts optional `sessionDate` parameter
  - OpenAI and Anthropic adapters updated with date-aware prompts

- **Active Forgetting** — Exponential decay model for memory relevance
  - New `Memory` fields: `lastRetrievedAt`, `retrievalCount`
  - `ForgettingConfig` with `forgettingHalfLifeMs` and `minRetrievalScore`
  - New exports: `applyDecay()`, `shouldArchive()`
  - Pinned memories exempt from decay

- **Reflection Pass** — Optional second LLM call validates extraction quality
  - `enableReflection` config flag
  - `reflectionPrompt` custom prompt override
  - New exports: `reflectOnExtraction()`, `applyReflectionResult()`
  - Catches contradictions, enriches vague facts, detects missed information
  - Graceful fallback on LLM errors

- **Memory Formatting Enhancements**
  - Priority signaling: `[CRITICAL]`, `[IMPORTANT]`, `[INFO]` markers
  - Chronological retrieval with month/year date headers
  - Cache-friendly context: stable prefix + dynamic suffix for prompt caching
  - Config: `prioritySignaling`, `chronologicalRetrieval`, `cacheableContext`

- **Demo Enhancements**
  - New Demo 4 "Memory Quality" showcasing reflection and decay
  - Priority badges, temporal date chips, decay info in memory panel
  - Cognitive Memory settings panel with live toggles
  - Chat auto-scroll on new messages

### Changed

- `Memory` type extended with `lastRetrievedAt`, `retrievalCount`
- `LLMAdapter.extractMemories()` signature updated to accept `sessionDate` parameter
- `formatMemoryContextDefault()` replaces basic formatter with structured output

## [1.0.0] - 2026-04-04

### Added

- Initial release as **Vitamem**
- Thread lifecycle state machine: `active → cooling → dormant → closed`
- Automatic memory extraction via LLM at dormant transition
- Cosine similarity deduplication (default threshold: 0.92)
- Embedding pipeline — computes embeddings once per thread, not per message
- `InMemoryAdapter` for development and testing
- `SupabaseAdapter` for production PostgreSQL storage
- `createVitamem()` facade with `createThread`, `chat`, `retrieve`, `triggerDormantTransition`, `closeThread`
- Full TypeScript support with strict types and declaration files
- 111 passing tests with 96.6% statement coverage
- Zero production dependencies
