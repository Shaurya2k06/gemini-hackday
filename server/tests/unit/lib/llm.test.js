import { test } from "node:test";
import assert from "node:assert/strict";
import { callStructuredLlm, callGeminiSearch } from "../../../src/lib/llm.js";

/** Stub global fetch and capture the outgoing request body. */
function withStubbedFetch(responseText, run) {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";

  const captured = {};
  globalThis.fetch = async (_url, options) => {
    captured.body = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: responseText }] }, finishReason: "STOP" }],
      }),
    };
  };

  return (async () => {
    try {
      return { result: await run(), captured };
    } finally {
      globalThis.fetch = previousFetch;
      if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = previousKey;
    }
  })();
}

// --- grounded search --------------------------------------------------------
// A merge once dropped `schema` from this function's parameter list while the
// body still referenced it, which threw "schema is not defined" and broke every
// grounded call — discovery included. These tests pin the signature.

test("callGeminiSearch works when no schema is supplied", async () => {
  const { result, captured } = await withStubbedFetch('{"companies":[]}', () =>
    callGeminiSearch({
      model: "gemini-test",
      purpose: "search-no-schema",
      messages: [{ role: "user", content: "find companies" }],
    })
  );

  assert.equal(result.content, '{"companies":[]}');
  assert.equal(result.finishReason, "STOP");
  assert.equal(result.truncated, false);
  assert.ok(captured.body.tools?.[0]?.googleSearch, "grounded search must enable the search tool");
  assert.equal(
    "responseJsonSchema" in captured.body.generationConfig,
    false,
    "no schema requested means none sent"
  );
});

test("callGeminiSearch forwards a schema when one is supplied", async () => {
  const schema = { type: "object", properties: { snapshot: { type: "string" } } };
  const { captured } = await withStubbedFetch('{"snapshot":"x"}', () =>
    callGeminiSearch({
      model: "gemini-test",
      purpose: "search-with-schema",
      schema,
      messages: [{ role: "user", content: "observe" }],
    })
  );

  assert.deepEqual(captured.body.generationConfig.responseJsonSchema, schema);
  assert.equal(captured.body.generationConfig.responseMimeType, "application/json");
  assert.ok(captured.body.tools?.[0]?.googleSearch, "schema must not disable grounding");
});

test("callGeminiSearch reports truncation via finishReason", async () => {
  const previousKey = process.env.GEMINI_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.GEMINI_API_KEY = "test-key";
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: "{" }] }, finishReason: "MAX_TOKENS" }],
    }),
  });

  try {
    const result = await callGeminiSearch({
      model: "gemini-test",
      purpose: "search-truncated",
      messages: [{ role: "user", content: "x" }],
    });
    assert.equal(result.truncated, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previousKey;
  }
});

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
