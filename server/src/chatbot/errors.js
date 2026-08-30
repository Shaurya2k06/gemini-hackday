/**
 * Map internal pipeline errors to user-facing guidance (no stack traces or schema jargon).
 */
export function mapPipelineError(error, _rawQuery = "") {
  const msg = error?.message ?? String(error);

  if (/Invalid unified company|total_raised must|employees_count must|must be a string/i.test(msg)) {
    return (
      "We couldn't build reliable company profiles from that search. " +
      "Try more specific screening criteria with sector, geography, and a revenue or EBITDA band — " +
      'for example: "B2B software in Germany, $15M–$40M revenue and 50–200 employees."'
    );
  }

  if (/GEMINI_API_KEY|API key/i.test(msg)) {
    return "Market research is temporarily unavailable. Please try again shortly.";
  }

  if (/ECONNREFUSED|fetch failed|network|timeout/i.test(msg)) {
    return "We couldn't reach the research service. Check your connection and try again.";
  }

  if (/too short|could not understand/i.test(msg)) {
    return msg;
  }

  return (
    "We couldn't complete your target screening right now. " +
    "Add sector, geography, and size criteria — for example: " +
    '"Fintech companies in Singapore, 50–200 employees."'
  );
}
