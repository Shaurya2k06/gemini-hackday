import { parseNaturalLanguageQuery } from "../light_agent/parser.js";
import { structuredToPills } from "../light_agent/pills.js";
import {
  reconcileMandateStructured,
  mergeFieldAddition,
  mergeIncrementalMandate,
  looksLikeLocationFragment,
} from "../light_agent/mandate-merge.js";
import { resolveQueryIntent } from "../light_agent/intent-routing.js";
import { mapPipelineError } from "./errors.js";
import { runDiscoveryFromParsed, runDiscoveryExpand } from "./pipeline.js";
import { formatCompanyCard } from "./format.js";
import {
  isCompanyLookupIntent,
  runCompanyLookupPipeline,
} from "../light_agent/company-lookup.js";
import {
  enrichCompanyViaOpenAI,
  mergeDeepDiveIntoCompany,
  sanitizeEnrichmentAgainstMandate,
} from "../heavy_agent/openai-enrich.js";

export async function handleMandateParse({
  text,
  accumulatedText = "",
  priorStructured = null,
  fieldHint = null,
} = {}) {
  const fragment = String(text ?? "").trim();
  const prior = String(accumulatedText ?? "").trim();
  const combined = prior && fragment ? `${prior}, ${fragment}` : prior || fragment;

  if (!combined) {
    return {
      intent: "mandate_search",
      structured: null,
      pills: [],
      accumulatedText: "",
    };
  }

  if (fieldHint && priorStructured && fragment) {
    const structured = mergeFieldAddition(priorStructured, fieldHint, fragment);
    structured.raw_query = combined;
    return {
      intent: structured.intent,
      structured,
      pills: structuredToPills(structured),
      accumulatedText: combined,
    };
  }

  // Freeform "Anything else" location add — same path as Geography +
  if (
    !fieldHint &&
    priorStructured?.intent === "mandate_search" &&
    fragment &&
    looksLikeLocationFragment(fragment)
  ) {
    const structured = mergeFieldAddition(priorStructured, "geography", fragment);
    structured.raw_query = combined;
    return {
      intent: structured.intent ?? "mandate_search",
      structured,
      pills: structuredToPills(structured),
      accumulatedText: combined,
    };
  }

  // Freeform follow-up while building a mandate: parse the fragment only and
  // merge into prior so earlier criteria (e.g. keyword "tech") are not dropped.
  if (
    !fieldHint &&
    priorStructured?.intent === "mandate_search" &&
    fragment &&
    prior
  ) {
    const { structured: llmAddition } = await parseNaturalLanguageQuery(fragment);
    const merged = mergeIncrementalMandate(priorStructured, llmAddition, fragment);
    merged.raw_query = combined;
    const { intent, structured } = resolveQueryIntent(merged, combined);
    return {
      intent,
      structured,
      pills: intent === "mandate_search" ? structuredToPills(structured) : [],
      accumulatedText: combined,
    };
  }

  const { structured: llmStructured } = await parseNaturalLanguageQuery(combined);

  const reconciled =
    llmStructured.intent === "mandate_search"
      ? reconcileMandateStructured(combined, llmStructured)
      : { ...llmStructured };

  const { intent, structured } = resolveQueryIntent(
    { ...reconciled, raw_query: combined },
    combined
  );

  return {
    intent,
    structured,
    pills: intent === "mandate_search" ? structuredToPills(structured) : [],
    accumulatedText: combined,
  };
}

export async function handleDiscoverStream({ structured, rawQuery, onProgress, constraintMode } = {}) {
  try {
    const result = await runDiscoveryFromParsed(structured, rawQuery, {
      onProgress,
      constraintMode,
    });
    const cards = (result.ranked.results ?? []).map(formatCompanyCard);
    const otherCards = (result.ranked.other_results ?? []).map(formatCompanyCard);

    return {
      structured: result.structured,
      ranked: result.ranked,
      cards,
      other_cards: otherCards,
      dataSource: result.dataSource,
      heavySearchRan: result.heavySearchRan,
      pipeline_stages: result.stages,
      message: result.ranked.message ?? null,
    };
  } catch (error) {
    throw new Error(mapPipelineError(error, rawQuery));
  }
}

export async function handleDiscoverExpandStream({
  structured,
  rawQuery,
  existingDomains = [],
  additionalCount = 5,
  onProgress = null,
  constraintMode,
} = {}) {
  try {
    const result = await runDiscoveryExpand(structured, rawQuery ?? structured?.raw_query ?? "", {
      existingDomains,
      additionalCount,
      onProgress,
      constraintMode,
    });
    const cards = (result.ranked.results ?? []).map(formatCompanyCard);
    const startRank = existingDomains.length + 1;
    const rankedCards = cards.map((card, i) => ({ ...card, rank: startRank + i }));

    return {
      structured: result.structured,
      cards: rankedCards,
      addedCount: result.addedCount ?? cards.length,
      dataSource: result.dataSource,
      pipeline_stages: result.stages,
      message: result.ranked.message ?? null,
    };
  } catch (error) {
    throw new Error(mapPipelineError(error, rawQuery));
  }
}

export async function resolveCompanyLookup({ structured, onProgress } = {}) {
  if (!isCompanyLookupIntent(structured)) {
    return { found: false, error: "Not a company lookup intent" };
  }

  const result = await runCompanyLookupPipeline(
    { structured, model: null, attempts: 0 },
    { onProgress, skipHeavySearch: process.env.SKIP_HEAVY_SEARCH === "true" }
  );

  const primary = result.ranked.results?.[0];
  if (!primary?.company?.domain) {
    return {
      found: false,
      message: result.ranked.message ?? "Could not find that company.",
      structured: result.structured,
    };
  }

  return {
    found: true,
    domain: primary.company.domain,
    company: primary.company,
    card: formatCompanyCard(primary),
    structured: result.structured,
  };
}

export async function handleDeepDiveStream({
  company,
  structured = {},
  userQuestion = null,
  onProgress = null,
} = {}) {
  if (!company?.domain) {
    throw new Error("Company domain is required for deep dive");
  }

  onProgress?.({ step: "Opening investor dossier…", detail: company.name, at: Date.now() });

  const result = await enrichCompanyViaOpenAI(company, structured, {
    onProgress,
    userQuestion,
    force: true,
    deepDive: true,
  });

  let merged = { ...company };
  if (result.success && result.enrichment) {
    const sanitized = sanitizeEnrichmentAgainstMandate(
      result.enrichment,
      company,
      structured
    );
    merged = mergeDeepDiveIntoCompany(company, sanitized);
  }

  onProgress?.({ step: "Dossier ready", detail: merged.domain, at: Date.now() });

  const row = {
    rank: 1,
    company: merged,
    investment_summary: merged.investment_summary,
    enrichment_sources: merged.enrichment_sources ?? [],
  };

  return {
    dossier: formatCompanyCard(row),
    company: merged,
    enrichmentSuccess: result.success,
  };
}
