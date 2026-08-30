import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { callStructuredLlm } from "../lib/llm.js";
import {
  OPENAI_RESPONSE_SCHEMA,
  parseJsonSafely,
  validateStructuredQuery,
} from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(__dirname, "system-prompt.md");
const MAX_RETRIES = 2;

let cachedSystemPrompt;

export async function loadSystemPrompt() {
  if (!cachedSystemPrompt) {
    cachedSystemPrompt = await readFile(PROMPT_PATH, "utf8");
  }
  return cachedSystemPrompt;
}

export async function callLightAgentLlm(rawQuery, { model } = {}) {
  const systemPrompt = await loadSystemPrompt();
  const lightModel = model ?? process.env.LIGHT_LLM_MODEL ?? "gemini-flash-latest";

  return callStructuredLlm({
    model: lightModel,
    purpose: "light_agent_parse",
    schemaName: "structured_query",
    schema: OPENAI_RESPONSE_SCHEMA,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: rawQuery },
    ],
  });
}

/**
 * Parse natural language into validated structured query JSON.
 * Retries on malformed JSON or validation failure.
 */
export async function parseNaturalLanguageQuery(
  rawQuery,
  { llmCaller = callLightAgentLlm } = {}
) {
  if (!rawQuery || typeof rawQuery !== "string" || !rawQuery.trim()) {
    throw new Error("Query must be a non-empty string");
  }

  const trimmed = rawQuery.trim();
  let lastError;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { content, latencyMs, model } = await llmCaller(trimmed);

    const parsed = parseJsonSafely(content);
    if (!parsed.ok) {
      lastError = new Error(
        `Malformed JSON from Light Agent: ${parsed.error.message}`
      );
      continue;
    }

    try {
      const structured = validateStructuredQuery(parsed.value, trimmed);
      return {
        structured,
        parseLatencyMs: latencyMs,
        model,
        attempts: attempt + 1,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
