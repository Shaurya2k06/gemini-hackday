/**
 * Lightweight post-OpenAI domain verification (hostname token overlap).
 * Avoids full jina fan-out; flags mismatches for PE quality gate.
 */
import { significantNameTokens } from "./domain-relevance.js";

function normalizeHost(domain) {
  return String(domain ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split(".")[0]
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Whether the domain hostname plausibly matches the company name.
 */
export function hostnameMatchesCompanyName(name, domain) {
  const host = normalizeHost(domain);
  if (!host || host.length < 3) return false;
  const tokens = significantNameTokens(name).map((t) => t.replace(/[^a-z0-9]/g, ""));
  if (tokens.length === 0) return true;

  for (const token of tokens) {
    if (token.length < 3) continue;
    if (host.includes(token) || token.includes(host)) return true;
    if (host.startsWith(token.slice(0, 4)) || token.startsWith(host.slice(0, 4))) return true;
  }
  return false;
}

/**
 * Annotate OpenAI discovery results with domain_verified and confidence.
 */
export function verifyOpenAIDiscoveryResults(results) {
  return results.map((row) => {
    const verified = hostnameMatchesCompanyName(row.name, row.domain);
    return {
      ...row,
      domain_verified: verified,
      confidence_scores: {
        ...(row.confidence_scores ?? {}),
        discovery_domain_match: verified ? 1 : 0,
      },
    };
  });
}
