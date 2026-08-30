import { z } from "zod";
import { summarizeDossier, summarizeCard, cardField } from "../format.js";
import { createProgressBridge } from "../progress.js";
import { normalizeDomain } from "../store.js";
import { textResult, guarded, McpError, ErrorCode } from "./shared.js";

export function registerCompanyTools(server, store, pipeline) {
  registerLookup(server, store, pipeline);
  registerDeepDive(server, store, pipeline);
}

function registerLookup(server, store, pipeline) {
  server.registerTool(
    "zoron_lookup_company",
    {
      title: "Look up one named company",
      description:
        "Resolve a single company by name and return its profile. Use this when the user asks " +
        "about one specific company rather than screening for targets — including when " +
        "zoron_parse_mandate reports intent 'company_lookup'. For a full investor dossier, " +
        "follow up with zoron_deep_dive.",
      inputSchema: {
        companyName: z
          .string()
          .describe("The company name to resolve, e.g. 'Personio' or 'Acme Logistics'."),
        structured: z
          .record(z.any())
          .optional()
          .describe(
            "Optional structured context from zoron_parse_mandate to narrow the search " +
              "(geography, sector). Omit to search on the name alone."
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guarded("zoron_lookup_company", async (args, extra) => {
      const name = String(args.companyName ?? "").trim();
      if (!name) {
        throw new McpError(ErrorCode.InvalidParams, "`companyName` cannot be empty.");
      }

      // The pipeline gate requires intent `company_lookup` plus company_names,
      // so build that shape rather than paying for another parse call.
      const structured = {
        ...(args.structured ?? {}),
        intent: "company_lookup",
        company_names: [name],
        raw_query: args.structured?.raw_query ?? name,
      };

      const bridge = createProgressBridge(extra);
      let result;
      try {
        result = await pipeline.resolveCompanyLookup({
          structured,
          onProgress: bridge.onProgress,
        });
      } finally {
        bridge.finish();
      }

      // A miss is a legitimate answer, not a failure — report it plainly so the
      // model relays it instead of retrying.
      if (!result?.found) {
        return textResult(result?.message ?? `Could not find a company matching "${name}".`, {
          found: false,
          companyName: name,
          message: result?.message ?? null,
          progressEvents: bridge.count,
        });
      }

      const domain = normalizeDomain(result.domain);
      store.putDossier(domain, {
        dossier: result.card,
        company: result.company,
        enrichmentSuccess: null,
        source: "lookup",
      });

      const text = [
        `Found ${cardField(result.card, "name") ?? name} (${domain})`,
        "",
        summarizeCard(result.card),
        "",
        `Run zoron_deep_dive with domain "${domain}" for a full investor dossier.`,
      ].join("\n");

      return textResult(text, {
        found: true,
        companyName: cardField(result.card, "name") ?? name,
        domain,
        card: result.card,
        progressEvents: bridge.count,
        resourceUri: `zoron://dossier/${domain}`,
      });
    })
  );
}

/**
 * Recover a company object the enrichment step can consume.
 *
 * `formatCompanyCard` nests company data under `fields`, but the deep-dive
 * pipeline expects a flat company object keyed by `domain`.
 */
function companyFromCard(card) {
  if (!card) return null;
  const base = card.fields ? { ...card.fields } : { ...card };
  if (card.investment_summary && !base.investment_summary) {
    base.investment_summary = card.investment_summary;
  }
  if (card.enrichment_sources?.length && !base.enrichment_sources) {
    base.enrichment_sources = card.enrichment_sources;
  }
  if (card.verification_urls && !base.verification_urls) {
    base.verification_urls = card.verification_urls;
  }
  if (card.sources?.length && !base.sources_found) {
    base.sources_found = card.sources;
  }
  return base;
}

function resolveDeepDiveTarget(store, args) {
  if (args.company && typeof args.company === "object") {
    if (!args.company.domain) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "An inline `company` object must include a `domain`."
      );
    }
    return { company: args.company, structured: args.structured ?? {} };
  }

  if (!args.domain) {
    throw new McpError(
      ErrorCode.InvalidParams,
      "Provide `domain` (with `shortlistId` when the company came from a shortlist), or an inline `company` object."
    );
  }

  if (args.shortlistId) {
    const entry = store.getShortlist(args.shortlistId);
    if (!entry) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No shortlist found with id "${args.shortlistId}". Run zoron_discover first.`
      );
    }
    const card = store.findCard(args.shortlistId, args.domain);
    if (!card) {
      const available = store.shortlistDomains(args.shortlistId).join(", ");
      throw new McpError(
        ErrorCode.InvalidParams,
        `Shortlist "${args.shortlistId}" has no company with domain "${normalizeDomain(args.domain)}". Available: ${available || "none"}.`
      );
    }
    return {
      company: companyFromCard(card),
      structured: args.structured ?? entry.structured ?? {},
    };
  }

  // No shortlist given: fall back to a cached lookup, else the bare domain.
  const cached = store.getDossier(args.domain);
  if (cached?.company) {
    return { company: cached.company, structured: args.structured ?? {} };
  }
  if (cached?.dossier) {
    return { company: companyFromCard(cached.dossier), structured: args.structured ?? {} };
  }

  return {
    company: { domain: normalizeDomain(args.domain) },
    structured: args.structured ?? {},
  };
}

function registerDeepDive(server, store, pipeline) {
  server.registerTool(
    "zoron_deep_dive",
    {
      title: "Open a company dossier",
      description:
        "Build a full investor dossier for one company: financials, ownership signals, " +
        "leadership, competitive positioning and cited sources. Reference a company from a " +
        "shortlist by `shortlistId` + `domain`, or pass `domain` alone. Optionally ask a " +
        "targeted question via `userQuestion`. This runs live enrichment and takes a while.",
      inputSchema: {
        shortlistId: z
          .string()
          .optional()
          .describe("Shortlist the company came from, e.g. 's1'. Supplies mandate context."),
        domain: z
          .string()
          .optional()
          .describe("Company domain, e.g. 'acme.example'. Required unless `company` is given."),
        company: z
          .record(z.any())
          .optional()
          .describe("A full company object including `domain`, if you already have one."),
        structured: z
          .record(z.any())
          .optional()
          .describe("Mandate context so the dossier is framed against the thesis."),
        userQuestion: z
          .string()
          .optional()
          .describe(
            "A specific question to answer about this company, e.g. 'who owns it?' or " +
              "'why would this fit a buy-and-build?'."
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guarded("zoron_deep_dive", async (args, extra) => {
      const { company, structured } = resolveDeepDiveTarget(store, args);
      const bridge = createProgressBridge(extra);

      let result;
      try {
        result = await pipeline.handleDeepDiveStream({
          company,
          structured,
          userQuestion: args.userQuestion ?? null,
          onProgress: bridge.onProgress,
        });
      } finally {
        bridge.finish();
      }

      const domain = normalizeDomain(result.company?.domain ?? company.domain);
      store.putDossier(domain, {
        dossier: result.dossier,
        company: result.company,
        enrichmentSuccess: result.enrichmentSuccess,
        userQuestion: args.userQuestion ?? null,
        source: "deep_dive",
      });

      const entry = store.getDossier(domain);
      const lines = [summarizeDossier(entry)];
      if (result.enrichmentSuccess === false) {
        lines.push("");
        lines.push(
          "Note: live enrichment did not complete, so this dossier may be thinner than usual."
        );
      }

      return textResult(lines.join("\n"), {
        domain,
        enrichmentSuccess: result.enrichmentSuccess,
        userQuestion: args.userQuestion ?? null,
        progressEvents: bridge.count,
        resourceUri: `zoron://dossier/${domain}`,
      });
    })
  );
}
