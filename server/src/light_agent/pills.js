/** Map structured mandate fields → display criterion pills. */

import { sanitizeKeywordsForDisplay } from "./mandate-merge.js";

const STAGE_LABELS = {
  "pre-seed": "Pre-seed",
  seed: "Seed",
  series_a: "Series A",
  series_b: "Series B",
  series_c_plus: "Series C+",
  unknown: "Unknown",
};

function formatUsd(n) {
  if (n == null || !Number.isFinite(n)) return null;
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(0)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function formatRange(min, max, formatter = String) {
  if (min != null && max != null) return `${formatter(min)}–${formatter(max)}`;
  if (min != null) return `≥ ${formatter(min)}`;
  if (max != null) return `≤ ${formatter(max)}`;
  return null;
}

let pillCounter = 0;

function makePill(category, label, { field, value, removable = true } = {}) {
  pillCounter += 1;
  return {
    id: `${field ?? category}-${pillCounter}`,
    category,
    label,
    field: field ?? category.toLowerCase(),
    value,
    removable,
  };
}

/**
 * Build criterion pills from a validated structured query.
 */
export function structuredToPills(structured) {
  if (!structured) return [];
  const pills = [];
  const seenGeo = new Set();
  const seenSector = new Set();
  const seenStage = new Set();
  const seenKw = new Set();

  for (const geo of structured.geography ?? []) {
    const label = geo?.trim();
    const key = label?.toLowerCase();
    if (!label || seenGeo.has(key)) continue;
    seenGeo.add(key);
    pills.push(makePill("Geography", label, { field: "geography", value: geo }));
  }

  for (const tag of structured.sector_tags ?? []) {
    const label = tag?.trim();
    const key = label?.toLowerCase();
    if (!label || seenSector.has(key)) continue;
    seenSector.add(key);
    pills.push(makePill("Sector", label, { field: "sector_tags", value: tag }));
  }

  for (const stage of structured.funding_stage ?? []) {
    if (!stage || seenStage.has(stage)) continue;
    seenStage.add(stage);
    pills.push(
      makePill("Funding stage", STAGE_LABELS[stage] ?? stage, {
        field: "funding_stage",
        value: stage,
      })
    );
  }

  const revenueLabel = formatRange(
    structured.revenue_min,
    structured.revenue_max,
    formatUsd
  );
  if (revenueLabel) {
    pills.push(makePill("Revenue", revenueLabel, { field: "revenue" }));
  }

  const ebitdaLabel = formatRange(
    structured.ebitda_min,
    structured.ebitda_max,
    formatUsd
  );
  if (ebitdaLabel) {
    pills.push(makePill("EBITDA", ebitdaLabel, { field: "ebitda" }));
  }

  const empLabel = formatRange(structured.employees_min, structured.employees_max);
  if (empLabel) {
    pills.push(makePill("Employees", empLabel, { field: "employees" }));
  }

  if (structured.founded_after) {
    pills.push(
      makePill("Founded", `After ${structured.founded_after}`, {
        field: "founded_after",
        value: structured.founded_after,
      })
    );
  }
  if (structured.founded_before) {
    pills.push(
      makePill("Founded", `Before ${structured.founded_before}`, {
        field: "founded_before",
        value: structured.founded_before,
      })
    );
  }

  for (const kw of sanitizeKeywordsForDisplay(structured.keywords, structured)) {
    const label = kw?.trim();
    const key = label?.toLowerCase();
    if (!label || seenKw.has(key)) continue;
    seenKw.add(key);
    pills.push(makePill("Keywords", label, { field: "keywords", value: kw }));
  }

  for (const name of structured.company_names ?? []) {
    if (name?.trim()) {
      pills.push(
        makePill("Company", name.trim(), {
          field: "company_names",
          value: name,
          removable: false,
        })
      );
    }
  }

  return pills;
}

/**
 * Parse mandate text (accumulated + new fragment) and return pills + structured.
 */
export async function parseMandateWithPills(text, { parseFn }) {
  const accumulatedText = String(text ?? "").trim();
  if (!accumulatedText) {
    return {
      intent: "mandate_search",
      structured: null,
      pills: [],
      accumulatedText: "",
    };
  }

  const { structured } = await parseFn(accumulatedText);
  return {
    intent: structured.intent,
    structured,
    pills: structuredToPills(structured),
    accumulatedText,
  };
}
