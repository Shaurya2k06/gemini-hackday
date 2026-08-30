/**
 * Live, date-bounded signal extraction.
 *
 * Uses grounded web search to observe transition signals as they stood on a
 * given cutoff date. The schema is enforced on the wire (responseJsonSchema)
 * rather than repaired afterwards, because a signal without a usable
 * evidence_date is worthless to the scorer and silently dropping malformed
 * records would quietly bias a backtest.
 */

import { callGeminiSearch } from "../lib/llm.js";
import { parseLlmJson } from "../lib/parse-llm-json.js";
import { SIGNALS, SIGNAL_KEYS } from "./signals.js";
import { buildCutoffInstruction, auditPointInTime } from "./point-in-time.js";

function getModel() {
  return process.env.HEAVY_LLM_MODEL ?? "gemini-flash-latest";
}

/** Human-readable signal menu so the model knows what to look for. */
function signalCatalogue() {
  return SIGNAL_KEYS.map((key) => `- ${key} (${SIGNALS[key].direction}): ${SIGNALS[key].description}`).join(
    "\n"
  );
}

function buildPrompt({ name, domain, cutoff }) {
  return [
    buildCutoffInstruction(cutoff),
    "",
    `Company: ${name ?? domain}`,
    `Website: ${domain}`,
    "",
    "Task: search for publicly observable evidence about ownership, leadership,",
    "funding and succession, and report which of the signals below were true",
    `as of ${cutoff}.`,
    "",
    "Signal catalogue:",
    signalCatalogue(),
    "",
    "Rules:",
    "- Only report a signal when you found dated evidence for it. Omit the rest.",
    "- evidence_date must be the date of the underlying event or publication.",
    "- source_url must be a real page you consulted, not a search results page.",
    "- note must describe the observation only, with no reference to later events.",
    "- confidence: high when directly stated in a primary source, medium when",
    "  inferred from a credible secondary source, low when circumstantial.",
    "- Return an empty signals array if you find nothing datable. That is a valid answer.",
  ].join("\n");
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    snapshot: {
      type: "string",
      description:
        "One or two sentences describing the company as of the cutoff date. No post-cutoff events.",
    },
    signals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", enum: SIGNAL_KEYS },
          present: { type: "boolean" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          evidence_date: {
            type: "string",
            description: "YYYY-MM-DD of the event or publication, on or before the cutoff.",
          },
          source_url: { type: "string" },
          note: { type: "string" },
        },
        required: ["key", "present", "confidence", "evidence_date", "source_url", "note"],
      },
    },
  },
  required: ["snapshot", "signals"],
};

/**
 * Observe a company's transition signals as of `cutoff`.
 *
 * @returns {{
 *   domain: string, name: string, cutoff: string,
 *   snapshot: string, signals: Array, audit: object,
 *   model: string, latencyMs: number, error: string|null
 * }}
 */
export async function extractSignalsAsOf({ name, domain, cutoff }, { onProgress = null } = {}) {
  const model = getModel();
  const start = Date.now();
  onProgress?.({ step: `Observing ${name ?? domain} as of ${cutoff}…`, detail: domain, at: Date.now() });

  try {
    const { content } = await callGeminiSearch({
      model,
      purpose: "foresight_signal_extraction",
      schema: RESPONSE_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            "You are a private-equity research analyst reconstructing a historical snapshot. " +
            "You must not use knowledge of events after the stated cutoff date. Return strict JSON only.",
        },
        { role: "user", content: buildPrompt({ name, domain, cutoff }) },
      ],
    });

    const { parsed } = parseLlmJson(content);
    const rawSignals = Array.isArray(parsed.signals) ? parsed.signals : [];
    const snapshot = String(parsed.snapshot ?? "");

    // Guards run on our side, never the model's word.
    const audit = auditPointInTime({ cutoff, signals: rawSignals, narrative: snapshot });

    return {
      domain,
      name: name ?? domain,
      cutoff,
      snapshot,
      signals: audit.kept,
      audit,
      model,
      latencyMs: Date.now() - start,
      error: null,
    };
  } catch (error) {
    return {
      domain,
      name: name ?? domain,
      cutoff,
      snapshot: "",
      signals: [],
      audit: null,
      model,
      latencyMs: Date.now() - start,
      error: error.message,
    };
  }
}

export { RESPONSE_SCHEMA as SIGNAL_RESPONSE_SCHEMA };
