import { z } from "zod";
import { cardField } from "../format.js";
import { createProgressBridge } from "../progress.js";
import { normalizeDomain } from "../store.js";
import { textResult, errorResult, guarded, McpError, ErrorCode } from "./shared.js";

/** Mirrors MAX_CUSTOM_COLUMN_QUERY_LENGTH in server/src/chatbot/custom-column.js. */
const MAX_QUERY_LENGTH = 200;

export function registerAnalysisTools(server, store, pipeline) {
  registerCustomColumn(server, store, pipeline);
  registerGeneralInfo(server, store, pipeline);
}

function registerCustomColumn(server, store, pipeline) {
  server.registerTool(
    "meredian_custom_column",
    {
      title: "Add a researched column to a shortlist",
      description:
        "Research one extra data point for every company on a shortlist and attach it as a " +
        "named column — for example 'CEO name', 'HQ city', 'is it PE-backed?', or " +
        "'latest acquisition'. Each company is researched individually via live web search, " +
        "so this takes a while. The column persists on the shortlist and is included in exports.",
      inputSchema: {
        shortlistId: z.string().describe("Id from meredian_discover, e.g. 's1'."),
        query: z
          .string()
          .max(MAX_QUERY_LENGTH, `Keep the question under ${MAX_QUERY_LENGTH} characters.`)
          .describe(
            "The single data point to research per company, phrased as a short question " +
              "or field name, e.g. 'Who is the CEO?'."
          ),
      },
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    guarded("meredian_custom_column", async (args, extra) => {
      if (!process.env.GEMINI_API_KEY) {
        return errorResult(
          "GEMINI_API_KEY is not set, so custom column research cannot run. Set it in server/.env."
        );
      }

      const entry = store.getShortlist(args.shortlistId);
      if (!entry) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `No shortlist found with id "${args.shortlistId}". Run meredian_discover first.`
        );
      }
      if (!entry.cards.length) {
        return errorResult(
          `Shortlist "${args.shortlistId}" is empty, so there is nothing to research.`
        );
      }

      const bridge = createProgressBridge(extra);
      let result;
      try {
        result = await pipeline.extractCustomColumn(entry.cards, args.query, {
          onProgress: bridge.onProgress,
        });
      } finally {
        bridge.finish();
      }

      const label = result.label ?? args.query;
      const values = result.results ?? {};

      // Attach under `custom_columns` so the canonical `fields` shape is
      // untouched and repeated columns accumulate rather than overwrite.
      const merged = entry.cards.map((card) => {
        const domain = normalizeDomain(cardField(card, "domain"));
        return {
          ...card,
          custom_columns: {
            ...(card.custom_columns ?? {}),
            [label]: values[domain] ?? null,
          },
        };
      });
      store.replaceShortlistCards(args.shortlistId, merged, { columnLabel: label });

      const found = Object.values(values).filter((v) => v != null).length;
      const lines = [
        `Added column "${label}" to shortlist ${args.shortlistId} — ${found}/${merged.length} companies resolved.`,
        "",
      ];
      for (const card of merged) {
        const name = cardField(card, "name") ?? cardField(card, "domain");
        lines.push(
          `  ${String(card.rank ?? "-").padStart(2, " ")}. ${name}: ${card.custom_columns[label] ?? "—"}`
        );
      }
      lines.push("");
      lines.push(`Full payload: meredian://shortlist/${args.shortlistId}`);

      return textResult(lines.join("\n"), {
        shortlistId: args.shortlistId,
        label,
        query: result.query ?? args.query,
        resolvedCount: found,
        totalCount: merged.length,
        values,
        progressEvents: bridge.count,
        resourceUri: `meredian://shortlist/${args.shortlistId}`,
      });
    })
  );
}

function registerGeneralInfo(server, store, pipeline) {
  server.registerTool(
    "meredian_general_info",
    {
      title: "Ask a general PE question",
      description:
        "Answer a general private-equity question — concepts, deal-sourcing workflow, " +
        "diligence practice, financial metrics — without running a company search. " +
        "Use meredian_discover to find companies and meredian_lookup_company for one named company.",
      inputSchema: {
        question: z
          .string()
          .describe("The question, e.g. 'How is EBITDA adjusted in a buy-and-build?'."),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    guarded("meredian_general_info", async (args) => {
      const question = String(args.question ?? "").trim();
      if (!question) {
        throw new McpError(ErrorCode.InvalidParams, "`question` cannot be empty.");
      }

      const text = await pipeline.answerGeneralInfo(question);
      return textResult(text, { question, answer: text });
    })
  );
}
