import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateStructuredQuery } from "../../../src/light_agent/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SEED_COMPANIES = JSON.parse(
  await readFile(path.join(__dirname, "companies-seed.json"), "utf8")
).map(({ verification_url: _v, ...company }) => ({
  ...company,
  last_scraped_at: new Date().toISOString(),
  confidence_scores: {},
  sources_found: ["manual_seed"],
}));

export const FINTECH_SF = validateStructuredQuery(
  {
    intent: "mandate_search",
    company_names: [],
    sector_tags: ["fintech"],
    funding_stage: [],
    geography: ["San Francisco"],
    employees_min: null,
    employees_max: null,
    founded_after: null,
    founded_before: null,
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
    keywords: [],
  },
  "Find fintech startups in San Francisco"
);

export const SERIES_B_DEVTOOLS = validateStructuredQuery(
  {
    intent: "mandate_search",
    company_names: [],
    sector_tags: ["developer_tools"],
    funding_stage: ["series_b"],
    geography: [],
    employees_min: null,
    employees_max: null,
    founded_after: null,
    founded_before: null,
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
    keywords: [],
  },
  "Series B developer tools companies"
);

export const AI_ANY_STAGE = validateStructuredQuery(
  {
    intent: "mandate_search",
    company_names: [],
    sector_tags: ["ai"],
    funding_stage: [],
    geography: [],
    employees_min: null,
    employees_max: null,
    founded_after: null,
    founded_before: null,
    revenue_min: null,
    revenue_max: null,
    ebitda_min: null,
    ebitda_max: null,
    keywords: [],
  },
  "AI companies, any stage is fine"
);
