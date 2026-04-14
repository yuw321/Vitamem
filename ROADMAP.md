# Vitamem Roadmap

> Last updated: April 2026

Vitamem is currently in **developer preview**. The core API is stable,
but operational hardening is ongoing. This roadmap reflects our priorities
for reaching production readiness.

## Status Legend

| Label | Meaning |
|-------|---------|
| Done | Shipped in current release |
| In Progress | Actively being worked on |
| Planned | Committed to, not yet started |
| Exploring | Under consideration |

---

## v1.0 -- Foundation (Done)

- [x] Lifecycle state machine (active / cooling / dormant / closed)
- [x] Embedding-at-dormancy optimization
- [x] Two-tier deduplication (skip / supersede / save)
- [x] OpenAI, Anthropic, Ollama adapters
- [x] Supabase and Ephemeral storage adapters
- [x] Structured profile extraction (UserProfile)
- [x] Auto-pin rules and pinned memories
- [x] MMR diversity, recency weighting, retrieval hooks
- [x] Streaming support (chatStream / chatWithUserStream)
- [x] Presets (daily-checkin, weekly-therapy, on-demand, long-term)

## v1.1 -- Reliability (In Progress)

- [ ] Pluggable logger interface (replace console.warn/error)
- [ ] Per-fact error isolation in embedding pipeline
- [ ] Fix dormant-before-pipeline failure (revert on pipeline crash)
- [ ] Fix intra-batch supersede index bug in deduplication
- [ ] Consolidate all Supabase migrations into migrations/ folder
- [ ] Retry logic with exponential backoff for LLM calls
- [ ] Fix silent .catch() on forgetting metadata updates

## v1.2 -- Developer Experience (Planned)

- [ ] Comprehensive JSDoc on all VitamemConfig fields
- [ ] Generic PostgreSQL adapter (no Supabase dependency)
- [ ] Configurable autoRetrieve limit
- [ ] onExtract / onEmbed pipeline hooks
- [ ] vitamem.capabilities() method for adapter feature detection
- [ ] Examples README with run instructions
- [ ] Auto-generated API reference (TypeDoc)

## v1.3 -- Scale (Planned)

- [ ] Optimized deduplication via vector search (not full memory load)
- [ ] Batch embedding support for compatible providers
- [ ] Thread concurrency safety (advisory locks)
- [ ] SQLite adapter for local/edge deployments
- [ ] OpenTelemetry-compatible metrics hooks

## Exploring

- [ ] Redis caching layer
- [ ] Multi-tenant storage isolation
- [ ] Webhook/event system for memory lifecycle events
- [ ] Memory importance scoring
- [ ] Cross-thread memory sharing

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). If you want to work on a roadmap
item, open an issue first so we can coordinate.
