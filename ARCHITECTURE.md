# Architecture

This document defines the intended boundaries for the take-home implementation. Keep the solution small and prefer a working vertical slice over additional infrastructure.

## Core invariants

- SQLite is the persisted source of truth for config and chat history.
- The preview renders only server-confirmed config.
- The frontend never applies AI-proposed config patches directly.
- Anthropic never reads or writes SQLite directly.
- The Anthropic API key stays server-side and must not be logged or persisted.
- Config revision increments only when the persisted config actually changes.
- A successful chat turn is persisted atomically; partial config/message writes are never observable.

## Main flow

1. Frontend loads `GET /api/state`.
2. User sends a message to `POST /api/chat`.
3. Backend validates the request and loads the current state.
4. Backend sends current config, full persisted chat history, the user message, and the `update_config` tool schema to Anthropic.
5. Anthropic returns normal assistant text or a single `update_config` tool call with a config patch.
6. For a tool call, backend validates the patch, merges it with current config, validates the resulting full config, and determines whether the config actually changed.
7. Backend persists the successful turn in one SQLite transaction: user message, assistant message, and config/revision change when applicable.
8. Backend returns `{ state: StateSnapshot, toolActivity }`; `state` is the authoritative persisted state.
9. Frontend replaces its server state from `response.state` and renders chat + preview from it.

## Anthropic turn semantics

- No second Anthropic round-trip is made after `update_config`.
- If a response contains both text and one `update_config` call, the tool call takes precedence.
- More than one tool call in a turn is treated as an invalid AI response.
- After a successful config tool call, the backend synthesizes and persists a short assistant confirmation message.
- If the merged config equals the current config, revision is not incremented; the turn may still complete successfully with a no-change confirmation.

## Boundaries

### Shared contracts

Use Zod schemas with inferred TypeScript types for data crossing runtime boundaries: `Config`, `StoredMessage`, `StateSnapshot`, `ChatRequest`, `ChatResponse`, `ConfigPatch`, and tool activity.

Tool activity is intentionally minimal: `{ type: 'config_update', status: 'success' }`. It is response/UI metadata only and is not persisted. Raw Anthropic tool arguments stay on the backend and are never sent to the browser.

### Backend

- Fastify owns HTTP transport only.
- A small chat service owns Anthropic interaction and validates the `ConfigPatch` returned by the model.
- Database/application persistence owns merging with current config, validation of the full `Config`, transaction boundaries, and revision updates.
- `POST /api/chat` coordinates request validation, AI, persistence, and the final authoritative response.
- Successful chat turns are persisted; infrastructure failures are shown as transient UI errors rather than assistant messages.

### Error handling

- If Anthropic fails, return an HTTP error; do not change config/revision and do not persist a successful turn.
- If Anthropic returns an invalid config patch or invalid tool-call shape, reject it; do not change config or revision.
- If persistence fails, roll back the whole turn and return an HTTP error.
- Technical/infrastructure failures are transient UI errors, not persisted assistant messages.
- An unrelated but valid user request is not a technical error: persist the assistant reply while config and revision remain unchanged.

### Frontend

- API access is isolated from React components.
- React owns transient interaction state such as loading/error and renders server state.
- Preview reads `state.config` only.
- No optimistic config updates.
- Only one chat request is in flight at a time.
- A submitted user message may be shown as transient pending UI, but only `response.state.messages` is authoritative persisted history.

## Deliberate non-goals

Do not add streaming/SSE, pagination, retries, cancellation, state-management libraries, generic agent/tool runtimes, repository abstractions, OpenAPI/code generation, or production infrastructure unless the task contract later requires them.

## Testing focus

Prefer tests for contract invariants: atomic successful turns, unchanged config on unrelated requests or failures, revision changes only when persisted config actually changes, ordered persisted chat history, invalid input rejection, and invalid AI output rejection. Anthropic must be replaced with a fake/stub in automated tests.
