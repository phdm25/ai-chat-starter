# AI config chat starter

This project contains a small prepared backend and an empty frontend area.

The product goal is an AI chat where a user can ask the assistant to change a server-owned configuration. The interface should show the conversation and a read-only content card with a title, body text, and button label. The card must show only changes that the server has accepted and saved.

The project does not prescribe an AI library or frontend framework. Only the prepared state backend is included.

## Prepared backend

Use Node.js `>=22.13`.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The server starts at `http://127.0.0.1:3001`.

Set `ANTHROPIC_API_KEY` in `.env.local` before the development session. The Anthropic SDK is installed, but no model integration is prepared. Keep the key on the server. Do not send it to the browser, save it in SQLite, or write it to logs.

`GET /api/state` returns the current server state:

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

The backend uses built-in `node:sqlite` and stores the configuration and ordered chat history in `.data/db.sqlite`. Messages have a numeric ID, `user` or `assistant` role, content, and creation time. The schema and starter state are created automatically on first startup.

No other application behavior or production infrastructure is included.

Run the checks with:

```sh
npm run check
```
