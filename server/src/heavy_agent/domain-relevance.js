import { GENERIC_SECTOR_WORDS } from "./entity-plausibility.js";

export const DOMAIN_RELEVANCE_PASS_SCORE = 1;
export const DOMAIN_RELEVANCE_FAIL_SCORE = 0;

const STOP_WORDS = new Set([
  "get",
  "it",
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "for",
  "in",
  "on",
  "at",
  "to",
  "is",
  "are",
  "was",
  "be",
  "by",
  "with",
  "from",
  "as",
  "now",
  "done",
  "new",
  "all",
  "our",
  "your",
  "this",
  "that",
  "we",
  "you",
  "hq",
]);

function normalizeAlphanumeric(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function tokenizeName(name) {
  return String(name ?? "")
    .replace(/[,.|–—&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean);
}

function extractHostnameLabel(domain) {
  const host = String(domain ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0];
  return host.split(".")[0] ?? "";
}

function hostnameCorroboratesName(domain, nameTokens) {
  const hostname = normalizeAlphanumeric(extractHostnameLabel(domain));
  if (!hostname) return false;

  const normalizedTokens = nameTokens
    .map((token) => normalizeAlphanumeric(token))
    .filter((token) => token.length >= 3);

  return normalizedTokens.some((token) => hostname.includes(token));
}

function filterNonGenericTokens(tokens) {
  return tokens.filter((token) => !GENERIC_SECTOR_WORDS.has(token.toLowerCase()));
}

/**
 * Extract title + early body preview from jina markdown/plain text.
 */
export function extractPageSignal(text) {
  const raw = String(text ?? "").trim();
  if (!raw) {
    return { title: "", bodyPreview: "" };
  }

  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  let title = "";

  const heading = lines.find((l) => /^#+\s+/.test(l));
  if (heading) {
    title = heading.replace(/^#+\s+/, "").trim();
  } else if (lines[0]) {
    title = lines[0].slice(0, 120);
  }

  const bodyStart = raw.indexOf("\n");
  const bodyPreview =
    bodyStart >= 0 ? raw.slice(bodyStart + 1, bodyStart + 1 + 500).trim() : raw.slice(0, 500);

  return { title, bodyPreview };
}

/**
 * Significant tokens from company name for overlap checks.
 */
export function significantNameTokens(name) {
  const tokens = tokenizeName(name);
  const significant = tokens.filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

  if (significant.length > 0) {
    return significant;
  }

  return tokens.filter((t) => t.length >= 3);
}

function tokenAppearsAsWord(token, haystack) {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(haystack);
}

function failResult(reason, matchedTokens = []) {
  return {
    score: DOMAIN_RELEVANCE_FAIL_SCORE,
    passed: false,
    matchedTokens,
    reason,
  };
}

function passResult(reason, matchedTokens) {
  return {
    score: DOMAIN_RELEVANCE_PASS_SCORE,
    passed: true,
    matchedTokens,
    reason,
  };
}

/**
 * Check whether resolved page content relates to the company name.
 */
export function checkDomainRelevance(companyName, pageText, domain = null) {
  if (!pageText || !String(pageText).trim()) {
    return failResult("no_page_text");
  }

  const { title, bodyPreview } = extractPageSignal(pageText);
  const combined = `${title} ${bodyPreview}`.toLowerCase();
  const combinedNormalized = combined.replace(/[^a-z0-9]/g, "");
  const normalizedName = normalizeAlphanumeric(companyName);
  const nameTokens = significantNameTokens(companyName);

  if (normalizedName.length >= 3 && combinedNormalized.includes(normalizedName)) {
    if (normalizedName.length <= 4) {
      if (!hostnameCorroboratesName(domain, nameTokens)) {
        return failResult("weak_match_no_domain_corroboration", [companyName]);
      }
    }
    return passResult("name_substring_match", [companyName]);
  }

  const tokens = nameTokens;
  const longTokens = tokens.filter((t) => t.length >= 4);
  const tokensToCheck = longTokens.length > 0 ? longTokens : tokens;
  const matchedTokens = tokensToCheck.filter((t) => tokenAppearsAsWord(t, combined));
  const nonGenericMatched = filterNonGenericTokens(matchedTokens);

  if (matchedTokens.length > 0 && nonGenericMatched.length === 0) {
    return failResult("generic_token_only", matchedTokens);
  }

  if (nonGenericMatched.length > 0) {
    if (nonGenericMatched.length === 1 && nonGenericMatched[0].length <= 4) {
      if (!hostnameCorroboratesName(domain, nonGenericMatched)) {
        return failResult("weak_match_no_domain_corroboration", nonGenericMatched);
      }
    }
    return passResult("token_overlap", nonGenericMatched);
  }

  return failResult("no_name_overlap");
}
