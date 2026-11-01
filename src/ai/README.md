# Datalyst AI Module Boundary (Phase 0)

## Overview

The `src/ai` module establishes the server-only, provider-neutral boundary for artificial intelligence features in Datalyst.

## Key Architectural Invariants

1. **Enforced Server-Only Boundary**:
   - Every public runtime barrel and direct submodule (`src/ai/index.ts`, `src/ai/schemas/index.ts`, `src/ai/providers/index.ts`, `src/ai/providers/allowlist.ts`, `src/ai/providers/errors.ts`, `src/ai/providers/fake-provider.ts`, `src/ai/policy/index.ts`, `src/ai/policy/cost-tracker.ts`, `src/ai/policy/retry.ts`, `src/ai/policy/runner.ts`) enforces server-only execution via the repository's established `import 'server-only'` package marker.
   - Any attempt to import or re-export AI modules from client components (`"use client"`), browser bundles, or mobile app bundles is rejected at compile time and runtime.
   - Provider credentials and configurations are strictly server-side environment variables.

2. **Deterministic Stats Isolation**:
   - The deterministic statistics engine (`src/stats`) is the single source of truth for all mathematical calculations, correlations, p-values, and charts.
   - Statistics and analytics modules must **never** depend on or import AI provider modules.
   - AI features consume deterministic evidence packets produced by domain/stats services; they never compute primary statistics.

3. **Provider-Neutral Interface & Isolation**:
   - Product capabilities interact exclusively with the `AiProvider` interface or `AiExecutionPolicy`.
   - No feature code may import vendor-specific SDKs directly.
   - All tests use synthetic fixtures with `FakeAiProvider` and run completely offline without network access or vendor credentials.

4. **Synthetic-Only Default Allowlist**:
   - Default `APPROVED_MODELS` strictly approves synthetic test models (`fake-model`, `mock-echo`).
   - Production vendor models are deferred pending benchmarking and must be explicitly configured via validated server-side environment configuration rather than hard-coded into product defaults.
   - Unapproved model identifiers are rejected upfront with `AiModelNotAllowedError`.

5. **Provider/Model Matching Verification**:
   - The execution policy verifies that the injected provider matches the model's specified provider before any provider invocation.
   - Mismatches immediately throw `AiProviderMismatchError` (code `INVALID_REQUEST`, status 400), ensuring zero provider calls occur.

6. **Async-Aware Cost & Budget Enforcement**:
   - The policy runner awaits all Promise-capable `AiCostTracker` operations (`assertWithinBudget` pre-flight, `assertWithinBudget` post-response, and `recordCost` persistence).
   - Async pre-flight budget rejections guarantee zero provider calls, and successful runs guarantee cost persistence completion before returning.
   - `InMemoryAiCostTracker` provides default in-memory per-user daily budget limits with automatic date rollover.

7. **Bounded Execution & Reliability**:
   - Execution is wrapped with bounded timeouts and automatic `AbortController` signal propagation.
   - Transient failures (HTTP 429, HTTP 503, connection drops) are retried with exponential backoff.
   - Non-transient errors (invalid schema, authentication failure, budget exceeded, unapproved model, provider mismatch) fail immediately without retries.

8. **Zero Sensitive Payload Logging**:
   - Operational telemetry records safe metadata only (`correlationId`, `modelId`, `provider`, `latencyMs`, `usage`, `errorClass`, `status`).
   - Raw user prompts, habit notes, journal entries, and model completions are **never** logged to stdout, files, or error trackers.

## Module Structure

```text
src/ai/
├── index.ts                     # Guarded server-only barrel exports ('server-only')
├── providers/
│   ├── types.ts                 # Provider interface and request/response contracts
│   ├── allowlist.ts             # Approved model registry and pricing calculations
│   ├── errors.ts                # Normalized error taxonomy and sanitization
│   ├── fake-provider.ts         # Offline synthetic test provider
│   └── index.ts
├── schemas/
│   └── index.ts                 # Zod validation schemas for requests and responses
├── policy/
│   ├── cost-tracker.ts          # In-memory per-user daily cost tracker
│   ├── retry.ts                 # Transient retry policy with exponential backoff
│   ├── runner.ts                # Execution wrapper orchestrating policy rules
│   └── index.ts
└── __tests__/                   # Focused unit and integration tests
    ├── allowlist.test.ts        # Synthetic allowlist and pricing tests
    ├── fake-provider.test.ts    # Synthetic fake provider tests
    ├── error-normalization.test.ts # Error classification & sanitization tests
    ├── cost-tracker.test.ts     # In-memory budget tracker tests
    ├── retry.test.ts            # Transient retry & backoff tests
    ├── runner.test.ts           # Policy runner integration & async tracker tests
    └── server-only.test.ts      # Server-only boundary regression tests
```
