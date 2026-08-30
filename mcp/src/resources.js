import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { normalizeDomain } from "./store.js";

const JSON_MIME = "application/json";

function jsonContents(uri, payload) {
  return {
    contents: [
      {
        uri,
        mimeType: JSON_MIME,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function notFound(what, id) {
  // InvalidParams (not InternalError): the caller asked for something absent.
  return new McpError(
    ErrorCode.InvalidParams,
    `No ${what} found with id "${id}". It may have been evicted from this session's cache, or never created.`
  );
}

/**
 * Register the `zoron://` resource surface.
 *
 * Full payloads live here so tool results can stay compact. Completion
 * callbacks let hosts autocomplete known IDs.
 */
export function registerResources(server, store) {
  server.registerResource(
    "zoron-mandate",
    new ResourceTemplate("zoron://mandate/{id}", {
      list: undefined,
      complete: { id: () => store.stats().mandateIds },
    }),
    {
      title: "Zoron mandate",
      description:
        "A parsed investment mandate: structured criteria, UI pills, intent, and the accumulated natural-language query.",
      mimeType: JSON_MIME,
    },
    async (uri, { id }) => {
      const entry = store.getMandate(id);
      if (!entry) throw notFound("mandate", id);
      return jsonContents(uri.href, entry);
    }
  );

  server.registerResource(
    "zoron-shortlist",
    new ResourceTemplate("zoron://shortlist/{id}", {
      list: undefined,
      complete: { id: () => store.stats().shortlistIds },
    }),
    {
      title: "Zoron shortlist",
      description:
        "A ranked company shortlist from discovery: full enriched company cards, gated matches, and pipeline stage metadata.",
      mimeType: JSON_MIME,
    },
    async (uri, { id }) => {
      const entry = store.getShortlist(id);
      if (!entry) throw notFound("shortlist", id);
      return jsonContents(uri.href, entry);
    }
  );

  server.registerResource(
    "zoron-shortlist-company",
    new ResourceTemplate("zoron://shortlist/{id}/company/{domain}", { list: undefined }),
    {
      title: "Zoron shortlist company",
      description: "A single enriched company card from a stored shortlist, addressed by domain.",
      mimeType: JSON_MIME,
    },
    async (uri, { id, domain }) => {
      const entry = store.getShortlist(id);
      if (!entry) throw notFound("shortlist", id);
      const card = store.findCard(id, domain);
      if (!card) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Shortlist "${id}" has no company with domain "${normalizeDomain(domain)}".`
        );
      }
      return jsonContents(uri.href, card);
    }
  );

  server.registerResource(
    "zoron-dossier",
    new ResourceTemplate("zoron://dossier/{domain}", { list: undefined }),
    {
      title: "Zoron company dossier",
      description:
        "A deep-dive investor dossier for one company: enriched fields, investment summary, and cited sources.",
      mimeType: JSON_MIME,
    },
    async (uri, { domain }) => {
      const entry = store.getDossier(domain);
      if (!entry) throw notFound("dossier", normalizeDomain(domain));
      return jsonContents(uri.href, entry);
    }
  );
}
