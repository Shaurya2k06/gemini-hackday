import { parseNaturalLanguageQuery } from "./parser.js";

/**
 * Parse-only Light Agent — no DB or embedding (stateless discovery path).
 */
export async function runLightAgentParse(rawQuery, options = {}) {
  const start = Date.now();
  const { structured, parseLatencyMs, model, attempts } =
    await parseNaturalLanguageQuery(rawQuery, options);

  return {
    structured,
    latency: { parseMs: parseLatencyMs, totalMs: Date.now() - start },
    model,
    attempts,
  };
}

export { parseNaturalLanguageQuery } from "./parser.js";
export { validateStructuredQuery, STRUCTURED_QUERY_FIELDS, QUERY_INTENTS } from "./schema.js";
export {
  isCompanyLookupIntent,
  buildFocusedLookupStructured,
  runCompanyLookupPipeline,
  runCompanyLookupFromCompanies,
  COMPANY_LOOKUP_NO_RESULTS_MESSAGE,
} from "./company-lookup.js";
export { structuredToPills, parseMandateWithPills } from "./pills.js";
