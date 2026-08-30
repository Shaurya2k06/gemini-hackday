/** Route parsed queries to mandate builder vs chat modes. */

const THESIS_ONLY_KEYWORDS = new Set(
  ["startup", "startups", "company", "companies", "venture"].map((w) => w.toLowerCase())
);

function emptyScalars() {
  return {
    employees_min: null,
    employees_max: null,
    founded_after: null,
    founded_before: null,
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
    country_code: null,
    region: null,
  };
}

export function emptyChatStructured(intent = "general_info", rawQuery = "") {
  return {
    intent,
    company_names: [],
    sector_tags: [],
    funding_stage: [],
    geography: [],
    keywords: [],
    raw_query: rawQuery,
    ...emptyScalars(),
  };
}

/**
 * True when the structured query has fields worth showing in the mandate pill builder.
 */
export function hasMandateCriteria(structured) {
  if (!structured) return false;

  const {
    sector_tags = [],
    funding_stage = [],
    geography = [],
    keywords = [],
    employees_min,
    employees_max,
    founded_after,
    founded_before,
    revenue_min,
    revenue_max,
    ebitda_min,
    ebitda_max,
  } = structured;

  const meaningfulKeywords = keywords.filter(
    (kw) => !THESIS_ONLY_KEYWORDS.has(String(kw ?? "").toLowerCase())
  );

  return (
    sector_tags.length > 0 ||
    funding_stage.length > 0 ||
    geography.length > 0 ||
    meaningfulKeywords.length > 0 ||
    employees_min != null ||
    employees_max != null ||
    founded_after != null ||
    founded_before != null ||
    revenue_min != null ||
    revenue_max != null ||
    ebitda_min != null ||
    ebitda_max != null
  );
}

/** Extract a company name from short ownership / about questions. */
export function extractCompanyNameFromQuery(rawQuery) {
  const text = String(rawQuery ?? "").trim();
  if (!text) return null;

  const patterns = [
    /\bwho\s+owns\s+(?:the\s+)?(.+?)\??$/i,
    /\bwho\s+is\s+behind\s+(?:the\s+)?(.+?)\??$/i,
    /\btell\s+me\s+about\s+(.+?)\??$/i,
    /\bresearch\s+(.+?)\??$/i,
    /\bwhat\s+do\s+you\s+know\s+about\s+(.+?)\??$/i,
    /\babout\s+(.+?)\??$/i,
  ];

  for (const re of patterns) {
    const match = text.match(re);
    if (match?.[1]) {
      return match[1].trim().replace(/^the\s+/i, "");
    }
  }

  return null;
}

export function looksLikeChatQuestion(rawQuery) {
  const text = String(rawQuery ?? "").trim();
  if (!text) return false;

  if (/^(who|what|when|where|why|how|is|are|does|do|can|could|tell\s+me)\b/i.test(text)) {
    return true;
  }

  if (text.endsWith("?")) {
    return true;
  }

  // Only treat these as chat signals when they appear in question form. Bare
  // keywords must NOT match: mandates legitimately contain "founder-owned",
  // "founded after 2020", and "raised Series B", and matching those words
  // alone would misroute a real screen to general_info.
  if (/\bwho\s+(owns|founded|runs|leads|backs)\b/i.test(text)) {
    return true;
  }

  if (/\b(valuation|net\s+worth|market\s+cap|last\s+round|revenue)\s+of\s+\S/i.test(text)) {
    return true;
  }

  return false;
}

export function looksLikeDiscoveryQuery(rawQuery) {
  const text = String(rawQuery ?? "").trim();
  if (!text) return false;
  return /\b(find|search|list|show\s+me|discover|looking\s+for|companies|startups|mandate)\b/i.test(
    text
  );
}

/**
 * Normalize LLM intent: mandate builder only when real criteria exist;
 * otherwise route factual questions to general_info chat.
 */
export function resolveQueryIntent(structured, rawQuery = "") {
  if (!structured) {
    return {
      intent: looksLikeChatQuestion(rawQuery) ? "general_info" : "mandate_search",
      structured: emptyChatStructured("general_info", rawQuery),
    };
  }

  let intent = structured.intent;
  let next = { ...structured, raw_query: rawQuery || structured.raw_query };

  if (intent === "general_info" && next.company_names?.length) {
    next.company_names = [];
  }

  if (intent === "company_lookup") {
    if (!next.company_names?.length) {
      const extracted = extractCompanyNameFromQuery(rawQuery);
      if (extracted) next.company_names = [extracted];
      else if (looksLikeChatQuestion(rawQuery)) {
        intent = "general_info";
        next = emptyChatStructured("general_info", rawQuery);
      }
    }
  }

  if (intent === "mandate_search") {
    if (looksLikeChatQuestion(rawQuery)) {
      intent = "general_info";
      next = emptyChatStructured("general_info", rawQuery);
    } else if (!hasMandateCriteria(next) && !looksLikeDiscoveryQuery(rawQuery)) {
      intent = "general_info";
      next = emptyChatStructured("general_info", rawQuery);
    }
  }

  next.intent = intent;
  return { intent, structured: next };
}
