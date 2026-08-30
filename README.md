# Meredian

Stateless AI discovery for Private Equity: build a mandate, review a 10-company shortlist, then open company dossiers.

## Stack

| Component | Choice |
|-----------|--------|
| API | Express (`server/`) |
| UI | React + Vite (`client/`) |
| MCP server | `@modelcontextprotocol/sdk` over stdio (`mcp/`) |
| Database | Neon PostgreSQL |
| Light Agent | Gemini `gemini-flash-latest` |
| Discovery + enrichment | Gemini `gemini-flash-latest` with Google Search grounding |

## Quick start (development)

Frontend and API run on **separate origins** — the UI calls the API via `VITE_API_URL` (no Vite proxy).

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
# Set GEMINI_API_KEY in server/.env

cd server && npm install && cd ..
cd client && npm install && cd ..

# Terminal 1 — API (port 3001)
cd server && npm run dev

# Terminal 2 — UI (port 5173, calls API at VITE_API_URL)
cd client && npm run dev
```

## Production deploy

Deploy the API and UI separately:

- **API:** deploy `server/` with `CORS_ORIGINS=https://your-frontend-domain.com`
- **UI:** build `client/` with `VITE_API_URL=https://your-api-domain.com`, deploy `client/dist` to a static host (e.g. Vercel, Netlify, S3)

```bash
cd server && npm install
cd client && VITE_API_URL=https://your-api-domain.com npm run build
```

## Environment variables

| Directory | Variable | Required | Description |
|-----------|----------|----------|-------------|
| `server/` | `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `server/` | `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `server/` | `CORS_ORIGINS` | Prod | Comma-separated frontend origins (default `http://localhost:5173` in dev) |
| `server/` | `LIGHT_LLM_MODEL` | No | Default `gemini-flash-latest` |
| `server/` | `HEAVY_LLM_MODEL` | No | Default `gemini-flash-latest` |
| `server/` | `PORT` | No | Default `3001` |
| `server/` | `SKIP_HEAVY_SEARCH` | No | Skip live heavy search when `true` |
| `client/` | `VITE_API_URL` | Yes | API origin, no trailing slash (e.g. `http://localhost:3001`) |

## MCP server

`mcp/` exposes the discovery pipeline as MCP tools so an MCP host (Claude Desktop, Kiro, Cursor) can drive Meredian directly. It imports `server/src/` in-process — no Express, no database, only the LLM API key.

The API service also exposes the same tools over public Streamable HTTP at `POST /mcp`. This is intentionally unauthenticated for the demo deployment; anyone who can reach the endpoint can invoke Gemini-backed tools. Sessions, including their in-memory mandates, shortlists, and dossiers, are isolated per MCP client and expire after 30 minutes idle time. Set `MCP_MAX_SESSIONS` (default `100`) or `MCP_SESSION_IDLE_TIMEOUT_MS` to tune the bounded in-memory session pool.

```bash
openclaw mcp add zoron \
  --url https://your-api-domain.com/mcp \
  --transport streamable-http \
  --timeout 300 \
  --connect-timeout 15
openclaw mcp doctor zoron --probe
```

```bash
cd mcp && npm install
```

See [`mcp/README.md`](mcp/README.md) for host configuration and the tool reference.

## Tests

```bash
cd server && npm test
cd mcp && npm test
```

## Repository layout

```
client/     React UI (mandate → results → company dive)
server/     Express API + pipeline source (`server/src/`)
mcp/        MCP server over stdio, wrapping the pipeline in-process
```

Dependencies are installed separately in `client/`, `server/` and `mcp/` — there is no root `package.json`.
