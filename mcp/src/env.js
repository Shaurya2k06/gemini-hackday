import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Repo-root-relative path to the Express server package. */
export const SERVER_DIR = path.resolve(__dirname, "..", "..", "server");

/**
 * Load `server/.env` into process.env.
 *
 * The Zoron pipeline modules read process.env directly (GEMINI_API_KEY,
 * HEAVY_LLM_MODEL, SKIP_HEAVY_SEARCH, tuning vars). Normally `server/index.js`
 * performs this load, but the MCP server never boots Express — so we do it here.
 *
 * `dotenv` lives in server/node_modules, so it is resolved from there rather
 * than being duplicated as an MCP dependency.
 *
 * `quiet: true` is essential: dotenv v17 otherwise prints a banner to stdout,
 * which is the JSON-RPC channel on stdio transports and would corrupt the
 * protocol stream. DOTENV_CONFIG_QUIET covers variants that read the flag from
 * the environment instead.
 */
export function loadServerEnv() {
  const envPath = path.join(SERVER_DIR, ".env");
  process.env.DOTENV_CONFIG_QUIET = "true";
  try {
    const requireFromServer = createRequire(path.join(SERVER_DIR, "package.json"));
    const dotenv = requireFromServer("dotenv");
    const result = dotenv.config({ path: envPath, quiet: true });
    return { loaded: !result.error, path: envPath };
  } catch {
    // dotenv unavailable or .env missing — fall back to ambient environment.
    return { loaded: false, path: envPath };
  }
}

/** Snapshot of the pipeline-relevant configuration, for diagnostics. */
export function describeConfig() {
  return {
    geminiKeyPresent: Boolean(process.env.GEMINI_API_KEY),
    lightModel: process.env.LIGHT_LLM_MODEL ?? "gemini-flash-latest",
    heavyModel: process.env.HEAVY_LLM_MODEL ?? "gemini-flash-latest",
    skipHeavySearch: process.env.SKIP_HEAVY_SEARCH === "true",
    discoveryLimit: process.env.OPENAI_DISCOVERY_LIMIT ?? null,
    resultCap: process.env.PE_RESULT_CAP ?? null,
    serverDir: SERVER_DIR,
  };
}
