import { test } from "node:test";
import assert from "node:assert/strict";
import { generatePdf, isValidPdf } from "../../../src/chatbot/export.js";

const SAMPLE = [
  {
    rank: 1,
    pe_fit_score: 82,
    fit_summary: "Within revenue band with sufficient headcount.",
    fit_status: "strong_match",
    company: {
      name: "Mach7 Technologies Ltd",
      domain: "mach7.com",
      description:
        "Enterprise imaging and data management software for healthcare providers.",
      geography: "Australia",
      funding_stage: "series_c_plus",
      founded_date: "2007-01-01",
      employees_count: 103,
      annual_revenue_usd: 23_000_000,
      sector_tags: ["healthcare", "imaging", "enterprise software"],
      investors: [
        "One Funds Management Limited",
        "Microequities Asset Management Pty Ltd",
        "Australian Ethical Investment",
      ],
      investment_summary:
        "Mach7 reported revenue near $23M with improving cash flow. Ownership is disperse across institutional holders. Key diligence items include competitive positioning versus larger PACS vendors and recurring license mix.",
      sources_found: ["openai_web_enrich"],
      enrichment_sources: [
        "https://mach7.com/about",
        "https://www.asx.com.au/markets/company/m7t",
      ],
      verification_urls: {},
    },
  },
];

test("generatePdf produces a valid multi-font diligence PDF", () => {
  const pdf = generatePdf(SAMPLE);
  assert.equal(isValidPdf(pdf), true);
  assert.ok(pdf.includes("/BaseFont /Helvetica-Bold"));
  assert.ok(pdf.includes("Mach7 Technologies Ltd"));
  assert.ok(pdf.includes("Investment thesis"));
  assert.ok(pdf.includes("mach7.com"));
  assert.ok(pdf.includes("Page 1 of"));
});

test("generatePdf wraps long investor lists instead of truncating mid-word on one line", () => {
  const pdf = generatePdf(SAMPLE);
  assert.ok(pdf.includes("Microequities"));
  assert.ok(pdf.includes("Australian Ethical"));
});
