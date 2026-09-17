# AI config chat

A small full-stack app where a user can discuss a server-owned content configuration with an AI assistant and ask it to change the card title, body, or button label.

The UI shows persisted chat history beside a read-only preview. The preview is updated only from server-confirmed state; AI-proposed changes are never applied optimistically in the browser.

## Requirements

Use Node.js `>=22.13`.

## Setup

```sh
npm ci
cp .env.example .env.local
```

Set your Anthropic API key in `.env.local`:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

The key is used only by the backend and is not sent to the browser, stored in SQLite, or logged.

## Run locally

```sh
npm run dev
```
This starts both applications:

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:3001`

The Vite dev server proxies `/api` requests to the backend.

## API

`GET /api/state` returns the authoritative persisted state:

```json
{
  "config": {
    "title": "Welcome",
    "body": "Discover what the app can do for you.",
    "buttonLabel": "Continue"
  },
  "revision": 1,
  "messages": []
}
```

`POST /api/chat` accepts:

```json
{ "message": "Change the button label to Submit" }
```
The backend sends the current config, persisted chat history, and the new user message to Anthropic. The model can either answer normally or request an `update_config` tool call with a partial config patch.

A successful turn is persisted atomically in SQLite: the user message, assistant message, and config/revision change when applicable. The frontend replaces its local snapshot only with the state returned by the server.

SQLite data is stored in `.data/db.sqlite` and is created automatically on first startup.

## Implementation notes

- React + Vite frontend.
- Fastify backend.
- Anthropic SDK integration stays server-side.
- Shared Zod contracts validate data crossing runtime boundaries.
- Config changes are validated and executed by the backend; the model never writes to SQLite directly.
- Only one chat request is sent at a time.
- Tool activity and infrastructure errors are transient UI state and are not persisted as chat history.
- No streaming, retries, pagination, or optimistic config updates.

See `ARCHITECTURE.md` for the detailed boundaries and turn semantics.

## Checks

```sh
npm run check
npm run build
```

`npm run check` typechecks backend and frontend and runs the automated tests. `npm run build` verifies the production frontend bundle.
