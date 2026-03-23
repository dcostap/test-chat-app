# Enterprise Demo Chat

Fast prototype monorepo for a simple chat UI backed by an OpenCode server.

## Apps

- `apps/web`: React + Vite chat interface
- `apps/api`: Hono API that proxies to OpenCode
- `packages/shared`: shared DTOs and helpers
- `infra/opencode`: example OpenCode config for a demo server

## Quick Start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the API environment file:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

3. Set `OPENCODE_BASE_URL` to your Linux test server, and optionally set basic auth credentials.

4. Start the monorepo:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:5173`.

## OpenCode Server

The frontend talks only to `apps/api`. The API proxies requests to OpenCode over HTTP.

See [infra/opencode/opencode.jsonc](./infra/opencode/opencode.jsonc) for an example project config using OpenRouter with `minimax/minimax-m2.5:free`.

### Linux Demo Server

1. Install OpenCode on the server.
2. Export your OpenRouter key:

   ```bash
   export OPENROUTER_API_KEY=...
   ```

3. Put the example `opencode.jsonc` file into the project/workspace directory you want OpenCode to run in.
4. Start OpenCode with HTTP access:

   ```bash
   export OPENCODE_SERVER_PASSWORD=change-me
   opencode serve --hostname 0.0.0.0 --port 4096 --cors http://localhost:5173 --cors http://localhost:3001
   ```

5. Point `apps/api/.env` at that server:

   ```bash
   OPENCODE_BASE_URL=http://your-linux-server:4096
   OPENCODE_USERNAME=opencode
   OPENCODE_PASSWORD=change-me
   OPENCODE_PROVIDER_ID=openrouter
   OPENCODE_MODEL_ID=minimax/minimax-m2.5:free
   ALLOWED_ORIGINS=http://localhost:5173,http://nelec-0:5173,http://nelec-0:4173
   ```

### Notes

- Leave `OPENCODE_PROVIDER_ID` and `OPENCODE_MODEL_ID` blank if the server already has a default model configured.
- For the first demo, this app uses OpenCode sessions directly as chats. There is no separate database yet.
