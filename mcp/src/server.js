import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describeConfig } from "./env.js";
import { ResultStore } from "./store.js";
import { registerResources } from "./resources.js";
import { registerPrompts } from "./prompts.js";
import * as defaultPipeline from "./pipeline.js";
import { registerMandateTools } from "./tools/mandate.js";
import { registerDiscoveryTools } from "./tools/discovery.js";
import { registerCompanyTools } from "./tools/company.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerExportTools } from "./tools/export.js";

export const SERVER_INFO = {
  name: "zoron",
  version: "1.0.0",
};

/**
 * Build the Zoron MCP server with every tool, resource and prompt registered.
 *
 * Transport-agnostic on purpose: `index.js` attaches stdio, and a Streamable
 * HTTP entrypoint can reuse this factory unchanged.
 *
 * @param store     result cache; defaults to a fresh in-memory store
 * @param pipeline  Zoron pipeline functions; injectable so tests can substitute
 *                  stubs instead of calling Gemini
 */
export function createZoronServer({
  store = new ResultStore(),
  pipeline = defaultPipeline,
} = {}) {
  const server = new McpServer(SERVER_INFO, {
    instructions:
      "Zoron performs private-equity target screening. Typical flow: " +
      "zoron_parse_mandate to build a structured mandate, zoron_discover to " +
      "produce a ranked shortlist, then zoron_deep_dive for per-company " +
      "dossiers. Full result payloads are available as zoron:// resources.",
  });

  registerHealthTool(server, store);
  registerMandateTools(server, store, pipeline);
  registerDiscoveryTools(server, store, pipeline);
  registerCompanyTools(server, store, pipeline);
  registerAnalysisTools(server, store, pipeline);
  registerExportTools(server, store, pipeline);
  registerResources(server, store);
  registerPrompts(server);

  // Exposed so tests can seed and inspect results without the protocol.
  server.zoronStore = store;
  return server;
}

function registerHealthTool(server, store) {
  server.registerTool(
    "zoron_health",
    {
      title: "Zoron health check",
      description:
        "Report whether the Zoron pipeline is configured and reachable: Gemini key " +
        "presence, configured models, and whether heavy search is skipped.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => {
      const config = describeConfig();
      let pipelineImport = "ok";
      try {
        await import("./pipeline.js");
      } catch (error) {
        pipelineImport = `failed: ${error.message}`;
      }

      const ready = config.geminiKeyPresent && pipelineImport === "ok";
      const stats = store.stats();
      const lines = [
        `Zoron MCP server ${ready ? "ready" : "NOT ready"}`,
        `  pipeline import: ${pipelineImport}`,
        `  GEMINI_API_KEY:  ${config.geminiKeyPresent ? "present" : "MISSING"}`,
        `  light model:     ${config.lightModel}`,
        `  heavy model:     ${config.heavyModel}`,
        `  heavy search:    ${config.skipHeavySearch ? "SKIPPED (offline mode)" : "live"}`,
        `  cached:          ${stats.mandates} mandate(s), ${stats.shortlists} shortlist(s), ${stats.dossiers} dossier(s)`,
      ];

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: { ready, pipelineImport, ...config, cache: stats },
      };
    }
  );
}
