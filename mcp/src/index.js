#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadServerEnv } from "./env.js";
import { redirectConsoleToStderr } from "./stdio-guard.js";
import { createZoronServer } from "./server.js";

// Must run before anything else can log: stdout is the JSON-RPC channel.
redirectConsoleToStderr();
loadServerEnv();

async function main() {
  const server = createZoronServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("zoron-mcp: listening on stdio");
}

main().catch((error) => {
  console.error("zoron-mcp: fatal error", error);
  process.exit(1);
});
