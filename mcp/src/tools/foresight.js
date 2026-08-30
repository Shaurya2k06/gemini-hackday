import { z } from "zod";
import { textResult, errorResult, guarded, McpError, ErrorCode } from "./shared.js";

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .describe("Date in YYYY-MM-DD form.");

export function registerForesightTools(server, store, pipeline) {
  registerTransitionScore(server, store, pipeline);
  registerBacktest(server, store, pipeline);
}

function renderScore(row) {
  const s = row.score;
  const lines = [
    `${row.name} (${row.domain}) — as of ${row.cutoff}`,
    `  transition score ${s.score} · band ${s.band} · ~${(s.probability * 100).toFixed(1)}% over ${s.horizonMonths} months (${s.lift}x base rate)`,
  ];

  if (row.snapshot) {
    lines.push("");
    lines.push(`  ${row.snapshot}`);
  }

  if (s.contributions.length) {
    lines.push("");
    lines.push("  Evidence:");
    for (const c of s.contributions) {
      const sign = c.direction === "negative" ? "−" : "+";
      lines.push(`    ${sign} ${c.key} (${c.confidence}, ${c.evidence_date})`);
      if (c.note) lines.push(`        ${c.note}`);
      if (c.source_url) lines.push(`        ${c.source_url}`);
    }
  } else {
    lines.push("");
    lines.push("  No dated, sourced signals found — scored at the base rate.");
  }

  if (row.audit && !row.audit.clean) {
    lines.push("");
    lines.push(
      `  Point-in-time guard tripped: ${row.audit.rejectedCount} item(s) discarded as post-cutoff or outcome-revealing.`
    );
  }

  lines.push("");
  lines.push(`  ${s.caveat}`);
  return lines.join("\n");
}

function registerTransitionScore(server, store, pipeline) {
  server.registerTool(
    "zoron_transition_score",
    {
      title: "Score ownership-transition likelihood",
      description:
        "Estimate how likely a company is to become acquirable, from dated public signals " +
        "(founder tenure, ownership concentration, adviser engagement, finance or corp-dev hires, " +
        "registry filings, succession language). This asks a different question from screening: " +
        "not 'does it match my filters' but 'is it about to be available'. Every contributing " +
        "signal carries a source and a date; unsourced claims are ignored. Runs live web research.",
      inputSchema: {
        name: z.string().optional().describe("Company name, e.g. 'Kovai.co'."),
        domain: z.string().describe("Company domain, e.g. 'kovai.co'."),
        cutoff: DATE.optional().describe(
          "Score the company as it stood on this date. Defaults to today. " +
            "Use a past date to reason from a historical vantage point."
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guarded("zoron_transition_score", async (args) => {
      const cutoff = args.cutoff ?? new Date().toISOString().slice(0, 10);
      const observation = await pipeline.extractSignalsAsOf({
        name: args.name,
        domain: args.domain,
        cutoff,
      });

      if (observation.error) {
        return errorResult(`Signal extraction failed: ${observation.error}`);
      }

      const score = pipeline.scoreTransition(observation.signals);
      const row = { ...observation, score };

      return textResult(renderScore(row), {
        domain: observation.domain,
        name: observation.name,
        cutoff,
        score: score.score,
        band: score.band,
        probability: score.probability,
        lift: score.lift,
        baseRate: score.baseRate,
        horizonMonths: score.horizonMonths,
        contributions: score.contributions,
        pointInTimeClean: observation.audit?.clean ?? null,
        rejectedEvidence: observation.audit?.rejected ?? [],
        caveat: score.caveat,
      });
    })
  );
}

function registerBacktest(server, store, pipeline) {
  server.registerTool(
    "zoron_backtest_thesis",
    {
      title: "Backtest a sourcing thesis point-in-time",
      description:
        "Rewind to a past date, score each company using only evidence that existed then, " +
        "resolve what actually happened afterwards, and report whether the ranking carried " +
        "information (precision@k and lift over the pool's own transaction rate). This makes a " +
        "sourcing thesis falsifiable. Candidates come from a stored shortlist or an explicit list. " +
        "Slow: it runs live research twice per company.",
      inputSchema: {
        shortlistId: z
          .string()
          .optional()
          .describe("Use the companies on a stored shortlist, e.g. 's1'."),
        candidates: z
          .array(
            z.object({
              name: z.string().optional(),
              domain: z.string(),
            })
          )
          .optional()
          .describe("Explicit candidates, when not using a shortlist."),
        cutoff: DATE.describe(
          "Historical vantage point. Scoring may only use evidence dated on or before this."
        ),
        asOf: DATE.optional().describe(
          "End of the outcome window. Defaults to today."
        ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guarded("zoron_backtest_thesis", async (args) => {
      let candidates = args.candidates ?? null;

      if (!candidates && args.shortlistId) {
        const entry = store.getShortlist(args.shortlistId);
        if (!entry) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `No shortlist found with id "${args.shortlistId}". Run zoron_discover first.`
          );
        }
        candidates = entry.cards
          .map((card) => ({
            name: card?.fields?.name ?? null,
            domain: card?.fields?.domain ?? null,
          }))
          .filter((c) => c.domain);
      }

      if (!candidates?.length) {
        throw new McpError(
          ErrorCode.InvalidParams,
          "Provide `candidates` or a `shortlistId` with at least one company."
        );
      }

      const report = await pipeline.runBacktest(candidates, {
        cutoff: args.cutoff,
        asOf: args.asOf,
      });

      return textResult(pipeline.formatBacktest(report), {
        cutoff: report.cutoff,
        asOf: report.asOf,
        candidates: report.candidates,
        evaluated: report.evaluated,
        unresolved: report.unresolved,
        transacted: report.transacted,
        observedRate: report.observedRate,
        priorBaseRate: report.priorBaseRate,
        precisionAt3: report.precisionAt3,
        precisionAt5: report.precisionAt5,
        liftOverPool: report.liftOverPool,
        bandBreakdown: report.bandBreakdown,
        contaminatedCount: report.contaminatedCount,
        warnings: report.warnings,
        ranked: report.ranked.map((r) => ({
          name: r.name,
          domain: r.domain,
          score: r.score.score,
          band: r.score.band,
          signals: r.score.contributions.map((c) => c.key),
          outcome: r.outcome.label,
          outcomeDate: r.outcome.outcome_date,
          counterparty: r.outcome.counterparty,
          outcomeSource: r.outcome.source_url,
        })),
      });
    })
  );
}
