import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.resolve(__dirname, "..", "src", "index.js");

/**
 * Drive the stdio entrypoint with raw JSON-RPC framing.
 *
 * This guards the two ways stdio transport silently breaks: a non-zero exit on
 * boot, and stray non-protocol bytes on stdout (dotenv banners, pipeline
 * console.log). Protocol semantics are covered by the in-memory tests.
 */
function runStdio(requests, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ENTRY], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));

    for (const req of requests) child.stdin.write(`${JSON.stringify(req)}\n`);
    child.stdin.end();
  });
}

const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "raw-test", version: "1.0.0" },
  },
};

test("stdio entrypoint answers initialize with clean protocol-only stdout", async () => {
  const { code, stdout, stderr } = await runStdio([INITIALIZE]);

  assert.equal(code, 0, `server exited ${code}; stderr: ${stderr}`);

  const lines = stdout.split("\n").filter((l) => l.trim());
  assert.ok(lines.length >= 1, "expected at least one response line");

  // Every stdout line must be valid JSON-RPC — no banners, no stray logs.
  for (const line of lines) {
    const parsed = JSON.parse(line);
    assert.equal(parsed.jsonrpc, "2.0", `non-JSON-RPC line on stdout: ${line}`);
  }

  const initResult = JSON.parse(lines[0]).result;
  assert.equal(initResult.serverInfo.name, "zoron");
  assert.ok(initResult.capabilities.tools, "tools capability must be advertised");
  assert.ok(initResult.capabilities.resources, "resources capability must be advertised");
  assert.ok(initResult.capabilities.prompts, "prompts capability must be advertised");

  // Diagnostics belong on stderr.
  assert.match(stderr, /listening on stdio/);
});

test("pipeline console.log is redirected away from stdout", async () => {
  // server/src/lib/logger.js calls console.log; the stdio guard must reroute it.
  const { stdout } = await runStdio(
    [
      INITIALIZE,
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "zoron_health", arguments: {} } },
    ],
    { GEMINI_API_KEY: "sk-test-key" }
  );

  for (const line of stdout.split("\n").filter((l) => l.trim())) {
    assert.doesNotThrow(() => JSON.parse(line), `stdout polluted: ${line}`);
  }
});
