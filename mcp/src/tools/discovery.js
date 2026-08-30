import { z } from "zod";
import { summarizeShortlist, summarizeCard } from "../format.js";
import { createProgressBridge } from "../progress.js";
import { textResult, guarded, resolveStructured, McpError, ErrorCode } from "./shared.js";

/** `normalizeConstraintMode` recognises only these two modes. */
const CONSTRAINT_MODES = ["heavy", "lite"];

const MANDATE_INPUT = {
  mandateId: z
    .string()
    .optional()
    .describe("Id from zoron_parse_mandate, e.g. 'm1'. Preferred over passing `structured`."),
  structured: z
    .record(z.any())
    .optional()
    .describe("An inline structured mandate, if you have one but no mandateId."),
  constraintMode: z
    .enum(CONSTRAINT_MODES)
    .optional()
    .describe(
      "'heavy' (default) applies the full PE quality gate and diligence checks. " +
        "'lite' relaxes the gate and returns a broader list."
    ),
};

export function registerDiscoveryTools(server, store, pipeline) {
  registerDiscover(server, store, pipeline);
  registerExpand(server, store, pipeline);
}

function registerDiscover(server, store, pipeline) {
  server.registerTool(
    "zoron_discover",
    {
      title: "Discover PE targets",
      description:
        "Run the full discovery pipeline for a mandate and return a ranked company shortlist. " +
        "This is the expensive step — it performs live web search and per-company enrichment, " +
        "and can take a few minutes. Returns a shortlistId for follow-up tools " +
        "(zoron_expand_shortlist, zoron_deep_dive, zoron_custom_column, zoron_export_shortlist).",
      inputSchema: {
        ...MANDATE_INPUT,
        rawQuery: z
          .string()
          .optional()
          .describe("Original natural-language query; defaults to the mandate's own text."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guarded("zoron_discover", async (args, extra) => {
      const { structured, rawQuery } = resolveStructured(store, args);
      const bridge = createProgressBridge(extra);

      let result;
      try {
        result = await pipeline.handleDiscoverStream({
          structured,
          rawQuery: args.rawQuery ?? rawQuery ?? structured?.raw_query ?? "",
          constraintMode: args.constraintMode,
          onProgress: bridge.onProgress,
        });
      } finally {
        bridge.finish();
      }

      const shortlistId = store.putShortlist({
        structured: result.structured ?? structured,
        cards: result.cards ?? [],
        otherCards: result.other_cards ?? [],
        dataSource: result.dataSource ?? null,
        heavySearchRan: result.heavySearchRan ?? null,
        pipelineStages: result.pipeline_stages ?? null,
        message: result.message ?? null,
        rawQuery: args.rawQuery ?? rawQuery ?? "",
      });

      const entry = store.getShortlist(shortlistId);
      return textResult(summarizeShortlist(entry), {
        shortlistId,
        count: entry.cards.length,
        gatedCount: entry.otherCards.length,
        dataSource: entry.dataSource,
        heavySearchRan: entry.heavySearchRan,
        message: entry.message,
        progressEvents: bridge.count,
        resourceUri: `zoron://shortlist/${shortlistId}`,
      });
    })
  );
}

function registerExpand(server, store, pipeline) {
  server.registerTool(
    "zoron_expand_shortlist",
    {
      title: "Expand an existing shortlist",
      description:
        "Find additional companies for an existing shortlist and append them, continuing the " +
        "rank numbering. Companies already on the shortlist are excluded automatically, so " +
        "there is no need to list them. Uses the mandate the shortlist was built from unless " +
        "you override it.",
      inputSchema: {
        shortlistId: z.string().describe("Id from zoron_discover, e.g. 's1'."),
        additionalCount: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe("How many further companies to look for. Defaults to 5."),
        constraintMode: MANDATE_INPUT.constraintMode,
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guarded("zoron_expand_shortlist", async (args, extra) => {
      const entry = store.getShortlist(args.shortlistId);
      if (!entry) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `No shortlist found with id "${args.shortlistId}". Run zoron_discover first.`
        );
      }

      // Derived from stored state so the caller never has to pass domains.
      const existingDomains = store.shortlistDomains(args.shortlistId);
      const beforeCount = entry.cards.length;
      const bridge = createProgressBridge(extra);

      let result;
      try {
        result = await pipeline.handleDiscoverExpandStream({
          structured: entry.structured,
          rawQuery: entry.rawQuery ?? entry.structured?.raw_query ?? "",
          existingDomains,
          additionalCount: args.additionalCount ?? 5,
          constraintMode: args.constraintMode,
          onProgress: bridge.onProgress,
        });
      } finally {
        bridge.finish();
      }

      const newCards = result.cards ?? [];
      store.appendToShortlist(args.shortlistId, newCards);
      const updated = store.getShortlist(args.shortlistId);

      const lines = [];
      if (!newCards.length) {
        lines.push(
          result.message ??
            "No additional companies matched the mandate. The search space may be exhausted; try relaxing criteria or constraintMode 'lite'."
        );
      } else {
        lines.push(`Added ${newCards.length} companies to shortlist ${args.shortlistId}:`);
        lines.push("");
        for (const card of updated.cards.slice(beforeCount)) lines.push(summarizeCard(card));
        lines.push("");
        lines.push(`Shortlist now holds ${updated.cards.length} companies.`);
      }
      lines.push(`Full payload: zoron://shortlist/${args.shortlistId}`);

      return textResult(lines.join("\n"), {
        shortlistId: args.shortlistId,
        addedCount: newCards.length,
        totalCount: updated.cards.length,
        excludedDomains: existingDomains.length,
        dataSource: result.dataSource ?? null,
        message: result.message ?? null,
        progressEvents: bridge.count,
        resourceUri: `zoron://shortlist/${args.shortlistId}`,
      });
    })
  );
}
