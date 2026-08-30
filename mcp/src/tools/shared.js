/** Shared helpers for building MCP tool results and validating inputs. */

import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

export function textResult(text, structuredContent) {
  const result = { content: [{ type: "text", text }] };
  if (structuredContent !== undefined) result.structuredContent = structuredContent;
  return result;
}

/**
 * A failed tool call that the model should see and can recover from.
 *
 * Per the MCP spec, tool execution failures are reported as `isError` results
 * rather than protocol errors, so the model can read the message and retry.
 */
export function errorResult(message) {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

/** Wrap a tool handler so unexpected throws become readable error results. */
export function guarded(name, handler) {
  return async (...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof McpError) throw error;
      const message = error?.message ?? String(error);
      return errorResult(`${name} failed: ${message}`);
    }
  };
}

/** Resolve a structured mandate from either a stored id or an inline object. */
export function resolveStructured(store, { mandateId, structured }) {
  if (mandateId) {
    const entry = store.getMandate(mandateId);
    if (!entry) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `No mandate found with id "${mandateId}". Run zoron_parse_mandate first, or pass \`structured\` inline.`
      );
    }
    return {
      structured: entry.structured,
      rawQuery: entry.accumulatedText,
      mandateEntry: entry,
    };
  }

  if (structured && typeof structured === "object") {
    return { structured, rawQuery: structured.raw_query ?? "", mandateEntry: null };
  }

  throw new McpError(
    ErrorCode.InvalidParams,
    "Provide either `mandateId` (from zoron_parse_mandate) or an inline `structured` mandate object."
  );
}

export { McpError, ErrorCode };
