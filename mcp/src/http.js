import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createZoronServer } from "./server.js";

const DEFAULT_MAX_SESSIONS = 100;
const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

function isInitializeRequest(body) {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((message) => message?.method === "initialize");
}

function configuredPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Build an Express-compatible handler for MCP's Streamable HTTP transport.
 *
 * Sessions intentionally get their own McpServer and ResultStore. This keeps a
 * public caller's mandate, shortlist and dossier resources private to that
 * caller while preserving the multi-step MCP workflow between requests.
 */
export function createMcpHttpHandler({
  createServer = createZoronServer,
  maxSessions = configuredPositiveInteger(process.env.MCP_MAX_SESSIONS, DEFAULT_MAX_SESSIONS),
  idleTimeoutMs = configuredPositiveInteger(
    process.env.MCP_SESSION_IDLE_TIMEOUT_MS,
    DEFAULT_IDLE_TIMEOUT_MS
  ),
} = {}) {
  const sessions = new Map();

  function dispose(record) {
    if (!record || record.disposed) return;
    record.disposed = true;
    if (record.sessionId) sessions.delete(record.sessionId);
    void record.server.close().catch(() => {});
  }

  const cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - idleTimeoutMs;
    for (const record of sessions.values()) {
      if (record.lastUsedAt < cutoff) dispose(record);
    }
  }, Math.min(idleTimeoutMs, 60_000));
  cleanupTimer.unref();

  async function handle(req, res) {
    const rawSessionId = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(rawSessionId) ? rawSessionId[0] : rawSessionId;
    let record = sessionId ? sessions.get(sessionId) : null;

    if (record) {
      record.lastUsedAt = Date.now();
      await record.transport.handleRequest(req, res, req.body);
      return;
    }

    if (sessionId) {
      res.status(404).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unknown MCP session" } });
      return;
    }

    if (req.method !== "POST" || !isInitializeRequest(req.body)) {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Initialize an MCP session with POST /mcp first" },
      });
      return;
    }

    if (sessions.size >= maxSessions) {
      res.status(503).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "MCP session capacity reached; retry shortly" },
      });
      return;
    }

    record = {
      server: null,
      transport: null,
      sessionId: null,
      lastUsedAt: Date.now(),
      disposed: false,
    };

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: randomUUID,
      onsessioninitialized: (newSessionId) => {
        record.sessionId = newSessionId;
        sessions.set(newSessionId, record);
      },
      onsessionclosed: () => dispose(record),
    });
    const server = createServer();
    record.server = server;
    record.transport = transport;
    transport.onclose = () => dispose(record);

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      dispose(record);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Unable to start MCP session" },
        });
      }
      throw error;
    }
  }

  handle.close = async () => {
    clearInterval(cleanupTimer);
    for (const record of [...sessions.values()]) dispose(record);
  };
  handle.sessionCount = () => sessions.size;
  return handle;
}

/** Register the public MCP endpoint without modifying existing API/auth routes. */
export function registerMcpHttpRoutes(app, options) {
  const handler = createMcpHttpHandler(options);
  app.all("/mcp", (req, res, next) => {
    handler(req, res).catch(next);
  });
  return handler;
}
