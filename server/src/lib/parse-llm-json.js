/**
 * Parse JSON from LLM responses with lightweight repairs for common model mistakes.
 */

function sliceJsonObjectBody(text) {
  const trimmed = String(text ?? "").trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in model response");
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
 * Extract and parse a JSON object from LLM text output.
 * @returns {{ parsed: object, repaired: boolean }}
 */
export function parseLlmJson(text) {
  const jsonText = sliceJsonObjectBody(text);

  try {
    return { parsed: JSON.parse(jsonText), repaired: false };
  } catch {
    const repairedText = repairLlmJsonText(jsonText);
    try {
      return { parsed: JSON.parse(repairedText), repaired: true };
    } catch (error) {
      throw new Error(`Invalid JSON in model response: ${error.message}`);
    }
  }
}

/** @deprecated Use parseLlmJson — kept for callers expecting a bare object. */
export function extractJsonObject(text) {
  return parseLlmJson(text).parsed;
}
