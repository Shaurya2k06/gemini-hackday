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

const EXCLUSION_SCHEMA = {
  type: "object",
  properties: {
    remove_geography: { type: "array", items: { type: "string" } },
    remove_sector_tags: { type: "array", items: { type: "string" } },
    remove_funding_stage: { type: "array", items: { type: "string" } },
  },
  required: ["remove_geography", "remove_sector_tags", "remove_funding_stage"],
  additionalProperties: false,
};

/**
 * A negative fragment ("I don't want the German companies") can't be parsed
 * in isolation the way `parseNaturalLanguageQuery` parses additions — it reads
 * as chit-chat with no criteria of its own. This asks the model, with the
 * mandate's current values in hand, which of those EXISTING values the user
 * means to drop (matching adjectival/demonym phrasing like "German" ->
 * "Germany"). Returns the same shape as a parsed addition so callers can feed
 * it straight into mergeIncrementalMandate's exclude path.
 */
export async function detectMandateExclusions({ prior, fragment, model } = {}) {
  const geography = prior?.geography ?? [];
  const sectorTags = prior?.sector_tags ?? [];
  const fundingStage = prior?.funding_stage ?? [];

  if (!geography.length && !sectorTags.length && !fundingStage.length) {
    return { geography: [], sector_tags: [], funding_stage: [] };
  }

  const lightModel = model ?? process.env.LIGHT_LLM_MODEL ?? "gemini-flash-latest";
  const prompt = [
    "The current search has these criteria values:",
    `geography: ${JSON.stringify(geography)}`,
    `sector_tags: ${JSON.stringify(sectorTags)}`,
    `funding_stage: ${JSON.stringify(fundingStage)}`,
    "",
    `The user just said: "${fragment}"`,
    "",
    "Which of the EXISTING values above (copy them verbatim from the lists) should be REMOVED based on what the user said? Only include a value if the user is clearly asking to exclude, remove, or drop it — including adjectival/demonym references (e.g. \"German\" refers to \"Germany\", \"French\" refers to \"France\", \"Dutch\" refers to \"Netherlands\"). If nothing should be removed, return empty arrays.",
  ].join("\n");

  const { content } = await callStructuredLlm({
    model: lightModel,
    purpose: "light_agent_exclusion",
    schemaName: "mandate_exclusions",
    schema: EXCLUSION_SCHEMA,
    messages: [{ role: "user", content: prompt }],
  });

  const parsed = parseJsonSafely(content);
  if (!parsed.ok) {
    return { geography: [], sector_tags: [], funding_stage: [] };
  }

  const value = parsed.value ?? {};
  const filterKnown = (values, known) => {
    const knownKeys = new Set(known.map((v) => String(v).toLowerCase()));
    return (Array.isArray(values) ? values : []).filter((v) =>
      knownKeys.has(String(v).toLowerCase())
    );
  };

  return {
    geography: filterKnown(value.remove_geography, geography),
    sector_tags: filterKnown(value.remove_sector_tags, sectorTags),
    funding_stage: filterKnown(value.remove_funding_stage, fundingStage),
  };
}
