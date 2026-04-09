# Contributing to Vitamem

Thank you for your interest in contributing! This document covers how to get set up, run tests, and submit changes.

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Setup

```bash
git clone https://github.com/yuw321/Vitamem.git
cd Vitamem
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage report
npm run test:coverage
```

### Building

```bash
npm run build
# Output goes to dist/
```

## Project Structure

```
src/
├── facade/           # createVitamem() — the main public API
├── lifecycle/        # State machine: active/cooling/dormant/closed transitions
├── memory/           # Fact extraction and cosine similarity deduplication
├── embedding/        # Embedding pipeline (extract → embed → dedup → save)
├── storage/          # InMemoryAdapter and SupabaseAdapter
├── types.ts          # All shared TypeScript interfaces and types
└── index.ts          # Public exports
```

## How to Contribute

1. **Fork** the repository and create a branch from `main`
2. **Make your changes** — keep them focused on a single concern
3. **Write tests** — all new code should have tests; keep coverage above 95%
4. **Run the full test suite** — `npm test` must pass
5. **Open a pull request** against `main` with a clear description

## Pull Request Guidelines

- Keep PRs small and focused — one feature or fix per PR
- Include a clear title and description explaining the change
- Reference any related issues using `Closes #123`
- Tests must pass and coverage must not decrease

## Adding a Storage Adapter

Implement the `StorageAdapter` interface from `src/types.ts`. See `src/storage/in-memory-adapter.ts` for a simple reference implementation and `src/storage/supabase-adapter.ts` for a production example.

## Adding an LLM Adapter Example

Examples live in `examples/`. Each example is a standalone TypeScript file showing how to wire up a specific LLM provider. See `examples/basic/openai-adapter.ts` for reference.

## Versioning

This project follows [Semantic Versioning](https://semver.org):

- **Patch** (1.0.x) — bug fixes, no API changes
- **Minor** (1.x.0) — new features, backwards-compatible
- **Major** (x.0.0) — breaking API changes

## Code of Conduct

Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Questions?

Open a [GitHub Discussion](https://github.com/yuw321/Vitamem/discussions) — we're happy to help.
