import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { Client } from "../../../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "../../../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";
import { registerMcpHttpRoutes } from "../../../../mcp/src/http.js";

async function startMcpApp() {
  const app = express();
  app.use(express.json());
  const mcp = registerMcpHttpRoutes(app, { maxSessions: 2, idleTimeoutMs: 60_000 });
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  return {
    mcp,
    url: `http://127.0.0.1:${port}/mcp`,
    async close() {
      await mcp.close();
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}

test("Streamable HTTP MCP initializes, lists tools, and releases a terminated session", async () => {
  const app = await startMcpApp();
  const transport = new StreamableHTTPClientTransport(new URL(app.url));
  const client = new Client({ name: "zoron-http-test", version: "1.0.0" });

  try {
    await client.connect(transport);
    assert.ok(transport.sessionId, "initialization must assign an MCP session ID");
    assert.equal(app.mcp.sessionCount(), 1);

    const { tools } = await client.listTools();
    assert.equal(tools.length, 12);
    assert.ok(tools.some((tool) => tool.name === "zoron_transition_score"));

    await transport.terminateSession();
    assert.equal(app.mcp.sessionCount(), 0);
  } finally {
    await client.close().catch(() => {});
    await app.close();
  }
});

test("Streamable HTTP MCP rejects non-initialization requests without a session", async () => {
  const app = await startMcpApp();
  try {
    const response = await fetch(app.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error.message, /Initialize an MCP session/);
  } finally {
    await app.close();
  }
});
