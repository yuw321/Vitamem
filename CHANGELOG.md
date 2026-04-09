# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
