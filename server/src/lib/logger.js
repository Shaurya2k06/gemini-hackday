const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const currentLevel =
  LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function log(level, message, meta = {}) {
  if (LEVELS[level] < currentLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message, meta) => log("debug", message, meta),
  info: (message, meta) => log("info", message, meta),
  warn: (message, meta) => log("warn", message, meta),
  error: (message, meta) => log("error", message, meta),

  /**
   * Log every external call per docs/context.md Section 11.
   * source, query, response status, latency, success/failure.
   */
  externalCall({ source, query, status, latencyMs, success, error }) {
    log(success ? "info" : "error", "external_call", {
      source,
      query,
      status,
      latencyMs,
      success,
      ...(error ? { error: String(error) } : {}),
    });
  },
};
