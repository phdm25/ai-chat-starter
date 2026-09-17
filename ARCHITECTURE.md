# Architecture

This document defines the intended boundaries for the take-home implementation. Keep the solution small and prefer a working vertical slice over additional infrastructure.

## Core invariants

- SQLite is the persisted source of truth for config and chat history.
- The preview renders only server-confirmed config.
- The frontend never applies AI-proposed config patches directly.
- Anthropic never reads or writes SQLite directly.
- The Anthropic API key stays server-side and must not be logged or persisted.
- Config revision increments only after a successful persisted config change.

## Main flow

1. Frontend loads `GET /api/state`.
2. User sends a message to `POST /api/chat`.
3. Backend validates the request and loads the current state.
4. Backend sends current config, relevant chat history, the user message, and the `update_config` tool schema to Anthropic.
5. Anthropic returns either normal assistant text or an `update_config` tool call with a config patch.
6. Backend validates the patch, merges it with the current config, validates the resulting full config, and persists it.
7. Backend persists the user and assistant messages.
8. Backend returns `{ state: StateSnapshot, toolActivity }`; `state` is the authoritative persisted state.
9. Frontend replaces its server state from `response.state` and renders chat + preview from it.

## Boundaries

### Shared contracts

Use Zod schemas with inferred TypeScript types for data crossing runtime boundaries: `Config`, `StoredMessage`, `StateSnapshot`, `ChatRequest`, `ChatResponse`, `ConfigPatch`, and tool activity.

Tool activity is intentionally minimal: `{ type: 'config_update', status: 'success' }`. It is UI metadata only. Raw Anthropic tool arguments stay on the backend and are never sent to the browser.

### Backend

- Fastify owns HTTP transport only.
- A small chat service owns Anthropic interaction and returns either assistant text or a validated config patch intent.
- Database helpers own SQLite reads/writes.
- `POST /api/chat` coordinates validation, AI, persistence, and the final authoritative response.
- Successful chat turns are persisted; infrastructure failures are shown as transient UI errors rather than assistant messages.

### Error handling

- If Anthropic fails, return an HTTP error; do not change config or revision and do not persist an assistant success message.
- If Anthropic returns an invalid config patch, reject it; do not change config or revision.
- If persistence fails, return an HTTP error and never report the config update as successful.
- Technical/infrastructure failures are transient UI errors, not persisted assistant messages.
- An unrelated but valid user request is not a technical error: the assistant may reply normally while config and revision remain unchanged.

### Frontend

- API access is isolated from React components.
- React owns only interaction state such as loading/error and renders server state.
- Preview reads `state.config` only.
- No optimistic config updates.

## Deliberate non-goals

Do not add streaming/SSE, pagination, retries, cancellation, state-management libraries, generic agent/tool runtimes, repository abstractions, OpenAPI/code generation, or production infrastructure unless the task contract later requires them.

## Testing focus

Prefer tests for contract invariants: successful persisted config update, unchanged config on unrelated requests or failures, revision changes only on successful config persistence, ordered persisted chat history, and invalid input rejection. Anthropic must be replaced with a fake/stub in automated tests.
