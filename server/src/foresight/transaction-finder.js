/**
 * Grounded discovery of real control transactions, used as positive labels.
 *
 * Labels are the unglamorous blocker in any backtest. Hard-coding a deal list
 * would be unverifiable and would rot, so transactions are discovered by
 * grounded search with mandatory dates and citations, then each one is
 * re-verified independently by the outcome oracle before it is trusted as a
 * label. Anything the oracle cannot confirm is discarded rather than assumed.
 */

import { callGeminiSearch } from "../lib/llm.js";
import { parseLlmJson } from "../lib/parse-llm-json.js";
import { parseEvidenceDate } from "./point-in-time.js";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    transactions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          domain: { type: "string", description: "The target's own website hostname." },
          announced_date: { type: "string", description: "YYYY-MM-DD announcement date." },
          acquirer: { type: "string" },
          kind: {
            type: "string",
            enum: ["acquisition", "majority_investment", "merger", "ipo"],
          },
          was_venture_backed: {
            type: "boolean",
            description: "True if the target had raised institutional venture or growth capital.",
          },
          source_url: { type: "string" },
        },
        required: [
          "name",
          "domain",
          "announced_date",
          "acquirer",
          "kind",
          "was_venture_backed",
          "source_url",
        ],
      },
    },
  },
  required: ["transactions"],
};

function getModel() {
  return process.env.HEAVY_LLM_MODEL ?? "gemini-flash-latest";
}

/**
 * Find control transactions matching a description within a date window.
 *
 * @param brief   natural-language description, e.g. "B2B SaaS companies in Europe"
 * @param from    window start (YYYY-MM-DD)
 * @param to      window end (YYYY-MM-DD)
 * @param limit   how many to ask for
 */
export async function findTransactions(
  { brief, from, to, limit = 20 },
  { onProgress = null } = {}
) {
  const model = getModel();
  const start = Date.now();
  onProgress?.({ step: "Searching for completed transactions…", detail: brief, at: Date.now() });

  const prompt = [
    `Find up to ${limit} real control transactions announced between ${from} and ${to}.`,
    `Target profile: ${brief}`,
    "",
    "A control transaction means an acquisition, a majority/control investment,",
    "a merger, or an IPO. Minority or growth rounds do not count.",
    "",
    "Rules:",
    "- Each entry must be a real, verifiable deal with a primary source.",
    "- domain must be the target company's own website, not the acquirer's.",
    "- announced_date must fall inside the window, in YYYY-MM-DD form.",
    "- was_venture_backed: true when the target had raised institutional venture",
    "  or growth capital before the deal; false when it was bootstrapped,",
    "  family-owned, or otherwise had no institutional investors.",
    "- Prefer small and mid-market companies over household names.",
    "- Do not invent deals. Return fewer entries rather than padding the list.",
  ].join("\n");

  try {
    const { content } = await callGeminiSearch({
      model,
      purpose: "foresight_transaction_discovery",
      schema: RESPONSE_SCHEMA,
      messages: [
        {
          role: "system",
          content:
            "You are an M&A researcher compiling verifiable deal records. Cite primary sources. Return strict JSON only.",
        },
        { role: "user", content: prompt },
      ],
    });

    const { parsed } = parseLlmJson(content);
    const fromTs = parseEvidenceDate(from);
    const toTs = parseEvidenceDate(to);

    const transactions = (Array.isArray(parsed.transactions) ? parsed.transactions : [])
      .map((t) => {
        const ts = parseEvidenceDate(t?.announced_date);
        const domain = String(t?.domain ?? "")
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .replace(/^www\./, "")
          .split("/")[0]
          .trim();
        return { ...t, domain, _ts: ts };
      })
      // Drop anything undated, out of window, or missing a usable domain: a
      // label we cannot place in time is useless for an anchored cutoff.
      .filter((t) => t.domain && t._ts !== null && t._ts >= fromTs && t._ts <= toTs)
      .map(({ _ts, ...t }) => t);

    // De-duplicate on domain.
    const seen = new Set();
    const unique = transactions.filter((t) => {
      if (seen.has(t.domain)) return false;
      seen.add(t.domain);
      return true;
    });

    return { transactions: unique, model, latencyMs: Date.now() - start, error: null };
  } catch (error) {
    return { transactions: [], model, latencyMs: Date.now() - start, error: error.message };
  }
}

export { RESPONSE_SCHEMA as TRANSACTION_RESPONSE_SCHEMA };
