/**
 * Live case-control study for the transition thesis.
 *
 * Usage:  node tests/live/case-control-study.mjs
 *
 * Stage 1 discovers real control transactions by grounded search and verifies
 * each one independently through the outcome oracle, so labels are never
 * hand-asserted. Stage 2 observes every subject at an anchored cutoff — cases a
 * fixed lead time before their own deal — and reports AUC.
 *
 * Sampling by outcome rather than by mandate is what makes the measurement
 * possible: at a ~4% base rate, a mandate-derived pool yields one positive and
 * precision@k cannot discriminate.
 */

import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const { findTransactions } = await import("../../src/foresight/transaction-finder.js");
const { runCaseControl, verifyCases, formatEvaluation } = await import(
  "../../src/foresight/case-control.js"
);

const LEAD_MONTHS = 12;
const CONTROL_CUTOFF = "2024-01-01";

const BRIEFS = [
  "B2B SaaS and vertical software companies in Europe (small and mid-market, under $100M revenue)",
  "B2B SaaS and vertical software companies in North America (small and mid-market)",
];

/**
 * Controls are companies whose outcome was independently resolved as "none"
 * over a multi-year window in earlier runs. They are held fixed so successive
 * studies stay comparable.
 */
const CONTROLS = [
  ["Kovai.co", "kovai.co"],
  ["LiveAgent", "liveagent.com"],
  ["CleverReach", "cleverreach.com"],
  ["Scoro", "scoro.com"],
  ["Teamwork.com", "teamwork.com"],
  ["Mapon", "mapon.com"],
  ["Phorest", "phorest.com"],
  ["Weglot", "weglot.com"],
  ["Agorapulse", "agorapulse.com"],
  ["SE Ranking", "seranking.com"],
  ["lemlist", "lemlist.com"],
  ["Smartproxy", "smartproxy.com"],
  ["Oxylabs", "oxylabs.io"],
  ["Kentico", "kentico.com"],
  ["Serpstat", "serpstat.com"],
  ["Mailtrap", "mailtrap.io"],
  ["Woodpecker", "woodpecker.co"],
  ["Hunter", "hunter.io"],
  ["Mentimeter", "mentimeter.com"],
  ["Vainu", "vainu.com"],
  ["DeskTime", "desktime.com"],
  ["Geckoboard", "geckoboard.com"],
  ["Myriota", "myriota.com"],
].map(([name, domain]) => ({ name, domain }));

async function main() {
  let discovered = [];
  for (const brief of BRIEFS) {
    const result = await findTransactions({
      brief,
      from: "2024-01-01",
      to: "2025-12-31",
      limit: 18,
    });
    process.stderr.write(`discovered ${result.transactions.length} for: ${brief.slice(0, 50)}\n`);
    discovered = discovered.concat(result.transactions);
  }

  const seen = new Set();
  discovered = discovered.filter((t) => !seen.has(t.domain) && seen.add(t.domain));

  // Second, independent grounded confirmation before a deal becomes a label.
  const verified = await verifyCases(discovered, { leadMonths: LEAD_MONTHS, concurrency: 6 });
  const cases = verified.filter((v) => v.verified);
  process.stderr.write(`verified ${cases.length} of ${verified.length} transactions\n`);

  const result = await runCaseControl(cases, CONTROLS, {
    leadMonths: LEAD_MONTHS,
    controlCutoff: CONTROL_CUTOFF,
    concurrency: 8,
    onProgress: (e) => process.stderr.write(`${e.step}\n`),
  });

  console.log(formatEvaluation(result.evaluation, result.rows));
  writeFileSync("/tmp/cc-result.json", JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("study failed:", error);
  process.exit(1);
});
