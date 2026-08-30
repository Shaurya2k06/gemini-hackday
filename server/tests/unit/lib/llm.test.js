import { test } from "node:test";
import assert from "node:assert/strict";
import { callStructuredLlm } from "../../../src/lib/llm.js";

test("callStructuredLlm sends JSON Schema via responseJsonSchema", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";

  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"intent":"mandate_search"}' }] } }],
      }),
    };
  };

  const schema = {
    type: "object",
    properties: {
      country_code: { type: ["string", "null"] },
    },
    additionalProperties: false,
  };

  try {
    const result = await callStructuredLlm({
      model: "gemini-test",
      purpose: "structured-schema-test",
      schemaName: "test_schema",
      schema,
      messages: [{ role: "user", content: "test" }],
    });

    assert.equal(result.content, '{"intent":"mandate_search"}');
    assert.equal(request.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(request.generationConfig.responseJsonSchema, schema);
    assert.equal(
      "responseSchema" in request.generationConfig,
      false,
      "OpenAPI/protobuf responseSchema must not receive JSON Schema"
    );
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});
