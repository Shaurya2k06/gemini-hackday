/**
 * Parse JSON from LLM responses with lightweight repairs for common model mistakes.
 */

function sliceJsonObjectBody(text) {
  const trimmed = String(text ?? "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  // An unterminated fence means the response was cut off mid-block; keep
  // everything after the opening fence so truncation salvage can run.
  const body = fence
    ? fence[1].trim()
    : trimmed.replace(/^```(?:json)?\s*/i, "").trim();
  const start = body.indexOf("{");
  if (start === -1) {
    throw new Error("No JSON object in model response");
  }
  const end = body.lastIndexOf("}");
  // No closing brace at all → truncated output. Return the remainder and let
  // the salvage pass rebuild it rather than failing outright.
  if (end <= start) {
    return body.slice(start);
  }
  return body.slice(start, end + 1);
}

function repairLlmJsonText(jsonText) {
  let repaired = jsonText;
  repaired = repaired.replace(/:\s*(unknown|undefined|NaN)\b/gi, ": null");
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  return repaired;
}

/**
 * Walk the text tracking string/escape state to find unclosed brackets.
 * @returns {{ closers: string[], inString: boolean }}
 */
function scanStructure(text) {
  const closers = [];
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") closers.push("}");
    else if (ch === "[") closers.push("]");
    else if (ch === "}" || ch === "]") closers.pop();
  }

  return { closers, inString };
}

/** Append the closers needed to balance a truncated fragment. */
function autoClose(fragment) {
  const { closers, inString } = scanStructure(fragment);
  if (inString) return null;
  const body = fragment.replace(/,\s*$/, "");
  if (!closers.length) return body;
  return body + closers.reverse().join("");
}

/**
 * Recover a usable object from output truncated mid-JSON.
 *
 * Grounded search responses spend budget on reasoning tokens and can be cut off
 * partway through a list. Rather than discarding the whole response, walk back
 * to the last complete element and close the open brackets, keeping the records
 * that did arrive intact.
 */
function salvageTruncatedJson(jsonText) {
  const MAX_ATTEMPTS = 400;
  let attempts = 0;

  for (let end = jsonText.length; end > 1 && attempts < MAX_ATTEMPTS; end -= 1) {
    const ch = jsonText[end - 1];
    // Only element boundaries can start a valid close.
    if (ch !== "}" && ch !== "]") continue;

    attempts += 1;
    const closed = autoClose(jsonText.slice(0, end));
    if (!closed) continue;

    try {
      return JSON.parse(closed);
    } catch {
      // keep walking back
    }
  }

  return null;
}

/**
 * Extract and parse a JSON object from LLM text output.
 * @returns {{ parsed: object, repaired: boolean, truncated: boolean }}
 */
export function parseLlmJson(text) {
  const jsonText = sliceJsonObjectBody(text);

  try {
    return { parsed: JSON.parse(jsonText), repaired: false, truncated: false };
  } catch {
    // fall through to repairs
  }

  const repairedText = repairLlmJsonText(jsonText);
  try {
    return { parsed: JSON.parse(repairedText), repaired: true, truncated: false };
  } catch (error) {
    const salvaged = salvageTruncatedJson(repairedText);
    if (salvaged) {
      return { parsed: salvaged, repaired: true, truncated: true };
    }
    throw new Error(`Invalid JSON in model response: ${error.message}`);
  }
}

/** @deprecated Use parseLlmJson — kept for callers expecting a bare object. */
export function extractJsonObject(text) {
  return parseLlmJson(text).parsed;
}
