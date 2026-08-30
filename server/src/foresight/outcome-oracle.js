/**
 * Outcome oracle — did this company actually transact?
 *
 * A backtest needs labels. Rather than shipping a hand-written outcome list
 * (which would be unverifiable and quietly rot), outcomes are resolved by
 * grounded search with mandatory citations, then filtered to the evaluation
 * window. Unresolvable companies are recorded as `unknown` rather than assumed
 * negative, because treating "no evidence found" as "did not transact" would
 * flatter precision.
 */

import { callGeminiSearch } from "../lib/llm.js";
import { parseLlmJson } from "../lib/parse-llm-json.js";
import { parseEvidenceDate, parseCutoff } from "./point-in-time.js";

const OUTCOME_TYPES = ["acquisition", "majority_investment", "merger", "ipo", "none"];

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    outcome: {
      type: "string",
      enum: OUTCOME_TYPES,
      description: "The control transaction that occurred, or 'none' if the company remains independent.",
    },
    outcome_date: {
      type: "string",
      description: "YYYY-MM-DD the transaction was announced, or empty when outcome is none.",
    },
    counterparty: {
      type: "string",
      description: "Acquirer or investor name, or empty when outcome is none.",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    source_url: { type: "string", description: "Primary source confirming the outcome." },
    note: { type: "string" },
  },
  required: ["outcome", "outcome_date", "counterparty", "confidence", "source_url", "note"],
};

function getModel() {
  return process.env.HEAVY_LLM_MODEL ?? "gemini-flash-latest";
}

/**
 * Resolve whether a company underwent a control transaction after `cutoff`.
 *
 * @param window.cutoff  start of the evaluation window (exclusive)
 * @param window.asOf    end of the evaluation window (inclusive)
 */
export async function resolveOutcome({ name, domain }, { cutoff, asOf }, { onProgress = null } = {}) {
  const model = getModel();
  const cutoffTs = parseCutoff(cutoff);
  const asOfTs = parseCutoff(asOf);
  const start = Date.now();

  onProgress?.({ step: `Resolving outcome for ${name ?? domain}…`, detail: domain, at: Date.now() });

  const prompt = [
    `Company: ${name ?? domain}`,
    `Website: ${domain}`,
    "",
    `Question: between ${cutoff} and ${asOf}, did this company undergo a control`,
    "transaction — an acquisition, a majority/control investment, a merger, or an IPO?",
    "",
    "Rules:",
    "- Search for and cite a primary source (press release, filing, reputable outlet).",
    "- outcome_date must be the announcement date in YYYY-MM-DD form.",
    "- Minority or growth rounds that do not transfer control are NOT a control transaction; use 'none'.",
    "- If you cannot find credible evidence of a control transaction, answer 'none'.",
    "- Do not guess. Set confidence low when the evidence is thin.",
  ].join("\n");

  try {
    const { content } = await callGeminiSearch({
      model,
      purpose: "foresight_outcome_resolution",
      schema: RESPONSE_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            "You verify corporate transaction outcomes. Cite primary sources. Return strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const { parsed } = parseLlmJson(content);
    const outcome = OUTCOME_TYPES.includes(parsed.outcome) ? parsed.outcome : "none";
    const dateTs = parseEvidenceDate(parsed.outcome_date);

    // A transaction only counts as a hit when it is dated inside the window.
    // Anything outside it is evidence about a different period.
    const inWindow = outcome !== "none" && dateTs !== null && dateTs > cutoffTs && dateTs <= asOfTs;
    const transacted = inWindow;

    let label = "none";
    if (transacted) label = "transacted";
    else if (outcome !== "none" && dateTs === null) label = "unknown";
    else if (outcome !== "none" && !inWindow) label = "out_of_window";

    return {
      domain,
      name: name ?? domain,
      label,
      transacted,
      outcome,
      outcome_date: parsed.outcome_date || null,
      counterparty: parsed.counterparty || null,
      confidence: parsed.confidence ?? "low",
      source_url: parsed.source_url || null,
      note: parsed.note || null,
      window: { cutoff, asOf },
      model,
      latencyMs: Date.now() - start,
      error: null,
    };
  } catch (error) {
    return {
      domain,
      name: name ?? domain,
      label: "unknown",
      transacted: false,
      outcome: null,
      outcome_date: null,
      counterparty: null,
      confidence: "low",
      source_url: null,
      note: null,
      window: { cutoff, asOf },
      model,
      latencyMs: Date.now() - start,
      error: error.message,
    };
  }
}

export { OUTCOME_TYPES, RESPONSE_SCHEMA as OUTCOME_RESPONSE_SCHEMA };
