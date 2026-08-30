# Zoron

Stateless AI discovery for Private Equity: build a mandate, review a 10-company shortlist, then open company dossiers.

## Stack

| Component | Choice |
|-----------|--------|
| API | Express (`server/`) |
| UI | React + Vite (`client/`) |
| Database | Neon PostgreSQL |
| Light Agent | OpenAI `gpt-4o-mini` |
| Discovery + enrichment | OpenAI `gpt-5-search-api` (`HEAVY_LLM_MODEL`) |

## Quick start (development)

Frontend and API run on **separate origins** — the UI calls the API via `VITE_API_URL` (no Vite proxy).

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
# Set OPENAI_API_KEY in server/.env

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
| `server/` | `OPENAI_API_KEY` | Yes | OpenAI API key |
| `server/` | `CORS_ORIGINS` | Prod | Comma-separated frontend origins (default `http://localhost:5173` in dev) |
| `server/` | `LIGHT_LLM_MODEL` | No | Default `gpt-4o-mini` |
| `server/` | `HEAVY_LLM_MODEL` | No | Default `gpt-5-search-api` |
| `server/` | `PORT` | No | Default `3001` |
| `server/` | `SKIP_HEAVY_SEARCH` | No | Skip live heavy search when `true` |
| `client/` | `VITE_API_URL` | Yes | API origin, no trailing slash (e.g. `http://localhost:3001`) |

## Tests

```bash
cd server && npm test
```

## Repository layout

```
client/     React UI (mandate → results → company dive)
server/     Express API + pipeline source (`server/src/`)
```

Dependencies are installed separately in `client/` and `server/` — there is no root `package.json`.
