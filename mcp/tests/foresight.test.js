import test from "node:test";
import assert from "node:assert/strict";
import { ResultStore } from "../src/store.js";
import { connectTestClient } from "./helpers/test-client.js";
import { makeShortlistInput } from "./helpers/fixtures.js";

function foresightPipeline(overrides = {}) {
  const calls = [];
  return {
    calls,
    pipeline: {
      extractSignalsAsOf: async (args) => {
        calls.push({ fn: "extractSignalsAsOf", args });
        return {
          domain: args.domain,
          name: args.name ?? args.domain,
          cutoff: args.cutoff,
          snapshot: "Founder-led vendor, self-funded.",
          signals: [
            {
              key: "advisor_engaged",
              present: true,
              confidence: "high",
              evidence_date: "2024-05-01",
              source_url: "https://example.com/adviser",
              note: "Corporate finance boutique named as adviser",
            },
          ],
          audit: { clean: true, keptCount: 1, rejectedCount: 0, rejected: [] },
          error: null,
        };
      },
      scoreTransition: (signals) => ({
        score: 1.6,
        band: "background",
        probability: 0.028,
        lift: 1.9,
        baseRate: 0.015,
        horizonMonths: 6,
        contributions: signals.map((s) => ({
          key: s.key,
          direction: "positive",
          weight: 1.6,
          confidence: s.confidence,
          delta: 1.6,
          evidence_date: s.evidence_date,
          source_url: s.source_url,
          note: s.note,
        })),
        usedSignals: signals.length,
        ignoredSignals: [],
        caveat: "Base rate over 6 months is 1.5%. Most companies will not transact.",
      }),
      runBacktest: async (candidates, opts) => {
        calls.push({ fn: "runBacktest", candidates, opts });
        return {
          cutoff: opts.cutoff,
          asOf: opts.asOf ?? "2026-08-30",
          candidates: candidates.length,
          evaluated: candidates.length,
          unresolved: 0,
          transacted: 1,
          observedRate: 0.5,
          priorBaseRate: 0.015,
          precisionAt3: { k: 3, hits: 1, evaluated: 2, precision: 0.5 },
          precisionAt5: { k: 5, hits: 1, evaluated: 2, precision: 0.5 },
          liftOverPool: 1,
          bandBreakdown: { background: { companies: 2, transacted: 1, unknown: 0 } },
          contaminatedCount: 0,
          warnings: ["Sample of 2 is far too small for statistical significance."],
          ranked: candidates.map((c, i) => ({
            name: c.name ?? c.domain,
            domain: c.domain,
            score: { score: 2 - i, band: "background", contributions: [] },
            outcome: {
              label: i === 0 ? "transacted" : "none",
              transacted: i === 0,
              outcome_date: i === 0 ? "2025-02-01" : null,
              counterparty: i === 0 ? "Acme Capital" : null,
              source_url: null,
            },
          })),
          elapsedMs: 10,
        };
      },
      formatBacktest: () => "Backtest — vantage point 2024-06-30",
      ...overrides,
    },
  };
}

test("foresight tools are registered", async () => {
  const { client, close } = await connectTestClient();
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("zoron_transition_score"));
    assert.ok(names.includes("zoron_backtest_thesis"));
  } finally {
    await close();
  }
});

test("zoron_transition_score reports score, band and cited evidence", async () => {
  const { pipeline, calls } = foresightPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_transition_score",
      arguments: { name: "Kovai.co", domain: "kovai.co", cutoff: "2024-06-30" },
    });

    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.band, "background");
    assert.equal(result.structuredContent.cutoff, "2024-06-30");
    assert.equal(result.structuredContent.pointInTimeClean, true);

    const text = result.content[0].text;
    assert.match(text, /transition score/);
    assert.match(text, /advisor_engaged/);
    assert.match(text, /https:\/\/example\.com\/adviser/, "evidence must be cited in the output");
    assert.match(text, /Most companies will not transact/, "must carry the base-rate caveat");

    assert.equal(calls[0].args.cutoff, "2024-06-30");
  } finally {
    await close();
  }
});

test("zoron_transition_score defaults the cutoff to today", async () => {
  const { pipeline, calls } = foresightPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    await client.callTool({
      name: "zoron_transition_score",
      arguments: { domain: "kovai.co" },
    });
    assert.match(calls[0].args.cutoff, /^\d{4}-\d{2}-\d{2}$/);
  } finally {
    await close();
  }
});

test("zoron_transition_score rejects a malformed cutoff", async () => {
  const { pipeline, calls } = foresightPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_transition_score",
      arguments: { domain: "kovai.co", cutoff: "June 2024" },
    });
    assert.equal(result.isError, true);
    assert.equal(calls.length, 0, "must not run live research on a bad cutoff");
  } finally {
    await close();
  }
});

test("zoron_transition_score surfaces extraction failure", async () => {
  const { pipeline } = foresightPipeline({
    extractSignalsAsOf: async () => ({
      domain: "x.com",
      name: "X",
      cutoff: "2024-06-30",
      snapshot: "",
      signals: [],
      audit: null,
      error: "search unavailable",
    }),
  });
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_transition_score",
      arguments: { domain: "x.com", cutoff: "2024-06-30" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /search unavailable/);
  } finally {
    await close();
  }
});

test("zoron_backtest_thesis pulls candidates from a stored shortlist", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(3));
  const { pipeline, calls } = foresightPipeline();
  const { client, close } = await connectTestClient({}, { store, pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_backtest_thesis",
      arguments: { shortlistId, cutoff: "2024-06-30" },
    });

    assert.equal(result.isError ?? false, false);
    const call = calls.find((c) => c.fn === "runBacktest");
    assert.deepEqual(
      call.candidates.map((c) => c.domain),
      ["co1.example", "co2.example", "co3.example"]
    );
    assert.equal(result.structuredContent.transacted, 1);
    assert.equal(result.structuredContent.ranked[0].outcome, "transacted");
    assert.ok(result.structuredContent.warnings.length, "small-sample caveat must be surfaced");
  } finally {
    await close();
  }
});

test("zoron_backtest_thesis accepts explicit candidates", async () => {
  const { pipeline, calls } = foresightPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    await client.callTool({
      name: "zoron_backtest_thesis",
      arguments: {
        candidates: [{ name: "Alpha", domain: "alpha.com" }],
        cutoff: "2023-01-01",
        asOf: "2025-01-01",
      },
    });
    const call = calls.find((c) => c.fn === "runBacktest");
    assert.equal(call.candidates[0].domain, "alpha.com");
    assert.equal(call.opts.cutoff, "2023-01-01");
    assert.equal(call.opts.asOf, "2025-01-01");
  } finally {
    await close();
  }
});

test("zoron_backtest_thesis requires candidates", async () => {
  const { pipeline } = foresightPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const missing = await client.callTool({
      name: "zoron_backtest_thesis",
      arguments: { cutoff: "2024-06-30" },
    });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /Provide `candidates` or a `shortlistId`/);

    const unknown = await client.callTool({
      name: "zoron_backtest_thesis",
      arguments: { shortlistId: "s99", cutoff: "2024-06-30" },
    });
    assert.equal(unknown.isError, true);
    assert.match(unknown.content[0].text, /No shortlist found/);
  } finally {
    await close();
  }
});
