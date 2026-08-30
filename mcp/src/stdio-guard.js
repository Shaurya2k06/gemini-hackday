/**
 * Protect the stdio JSON-RPC channel.
 *
 * On a stdio transport, stdout belongs exclusively to the MCP protocol. Any
 * stray write corrupts the stream and the host drops the connection. The Zoron
 * pipeline logs through `server/src/lib/logger.js`, which calls `console.log`,
 * so console output must be rerouted to stderr before any tool runs.
 *
 * The SDK transport writes via `process.stdout.write` directly, so redirecting
 * the `console` methods leaves the protocol path untouched.
 */
export function redirectConsoleToStderr() {
  const toStderr = (...args) => {
    process.stderr.write(
      args.map((a) => (typeof a === "string" ? a : safeInspect(a))).join(" ") + "\n"
    );
  };

  console.log = toStderr;
  console.info = toStderr;
  console.debug = toStderr;
  console.warn = toStderr;
}

function safeInspect(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
