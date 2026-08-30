# Zoron MCP server

Exposes the Zoron PE discovery pipeline as [Model Context Protocol](https://modelcontextprotocol.io) tools, so an MCP host — Claude Desktop, Kiro, Cursor — can build mandates, run screens, and open company dossiers directly.

The server imports `server/src/chatbot` **in-process**. It does not start Express and never connects to the database, so only a Gemini key is required.

## Setup

```bash
cd mcp && npm install
```

Configuration is read from `server/.env` (the same file the API uses). At minimum:

```
GEMINI_API_KEY=your-gemini-api-key
```

Register the server with your host using absolute paths:

```json
{
  "mcpServers": {
    "zoron": {
      "command": "node",
      "args": ["/absolute/path/to/gemini-hackday/mcp/src/index.js"]
    }
  }
}
```

Verify the connection by calling `zoron_health`, which reports key presence, the configured models, and whether the pipeline imported cleanly.

## Tools

| Tool | Purpose |
|------|---------|
| `zoron_health` | Report configuration and readiness |
| `zoron_parse_mandate` | Turn natural-language criteria into a structured mandate → `mandateId` |
| `zoron_parse_thesis_pdf` | Extract a mandate from an investment thesis PDF on disk |
| `zoron_discover` | Run discovery for a mandate → ranked `shortlistId` |
| `zoron_expand_shortlist` | Append more companies to a shortlist, excluding ones already on it |
| `zoron_lookup_company` | Resolve one named company |
| `zoron_deep_dive` | Build a full investor dossier for one company |
| `zoron_custom_column` | Research one extra data point for every company on a shortlist |
| `zoron_general_info` | Answer a general PE question without searching |
| `zoron_export_shortlist` | Write a shortlist to CSV or PDF on disk |

Typical flow: `zoron_parse_mandate` → `zoron_discover` → `zoron_deep_dive` → `zoron_export_shortlist`.

## Resources

Discovery payloads are large, so tools return a compact summary plus a resource URI rather than pushing full JSON through the model's context.

| URI | Contents |
|-----|----------|
| `zoron://mandate/{id}` | Structured mandate, criteria pills, intent |
| `zoron://shortlist/{id}` | Full enriched company cards, gated matches, pipeline stages |
| `zoron://shortlist/{id}/company/{domain}` | One company card from a shortlist |
| `zoron://dossier/{domain}` | Deep-dive dossier with cited sources |

Results live in memory for the lifetime of the server process and are capped (25 shortlists, 50 mandates, 100 dossiers), evicting least-recently-used entries.

## Prompts

- `screen_mandate` — guided screen from criteria to shortlist to deep-dive candidates
- `company_dossier` — research one named company end to end

## Notes

`zoron_discover` and `zoron_deep_dive` call the heavy search model and can take minutes. Progress is reported via MCP progress notifications when the host supplies a progress token. If your host times out, raise its per-request timeout.

For fast offline iteration, set `SKIP_HEAVY_SEARCH=true` in `server/.env` to skip live web search.

Custom columns appear in CSV exports only; the PDF report uses a fixed layout.

## Tests

```bash
cd mcp && npm test
```

Tool tests inject a stub pipeline, so they run without network access or an API key. The export tests deliberately use the real export code and validate the bytes written to disk.
