import test from "node:test";
import assert from "node:assert/strict";
import { ResultStore } from "../src/store.js";
import { connectTestClient } from "./helpers/test-client.js";
import { makeShortlistInput } from "./helpers/fixtures.js";

function analysisPipeline(overrides = {}) {
  const calls = [];
  return {
    calls,
    pipeline: {
      extractCustomColumn: async (cards, query, opts) => {
        calls.push({ fn: "extractCustomColumn", cards, query, opts });
        opts?.onProgress?.({
          step: "Researching custom column…",
          detail: `${cards.length} companies`,
        });
        return {
          query,
          label: query,
          results: {
            "co1.example": "Jane Doe",
            "co2.example": null,
            "co3.example": "Sam Patel",
          },
        };
      },
      answerGeneralInfo: async (question) => {
        calls.push({ fn: "answerGeneralInfo", question });
        return "EBITDA is adjusted for one-off costs and owner compensation.";
      },
      ...overrides,
    },
  };
}

const WITH_KEY = { GEMINI_API_KEY: "sk-test-key" };

test("meredian_custom_column merges researched values into the stored shortlist", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(3));
  const { pipeline, calls } = analysisPipeline();
  const { client, close } = await connectTestClient(WITH_KEY, { store, pipeline });
  try {
    const result = await client.callTool({
      name: "meredian_custom_column",
      arguments: { shortlistId, query: "Who is the CEO?" },
    });

    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.label, "Who is the CEO?");
    assert.equal(result.structuredContent.resolvedCount, 2, "one company returned null");
    assert.equal(result.structuredContent.totalCount, 3);

    // Values are attached per card and survive a later read of the shortlist.
    const entry = store.getShortlist(shortlistId);
    assert.equal(entry.cards[0].custom_columns["Who is the CEO?"], "Jane Doe");
    assert.equal(entry.cards[1].custom_columns["Who is the CEO?"], null);
    assert.equal(entry.cards[2].custom_columns["Who is the CEO?"], "Sam Patel");
    assert.deepEqual(entry.customColumns, ["Who is the CEO?"]);

    // The canonical card shape is left intact.
    assert.equal(entry.cards[0].fields.name, "Company 1");

    const text = result.content[0].text;
    assert.match(text, /Added column "Who is the CEO\?"/);
    assert.match(text, /Company 1: Jane Doe/);
    assert.match(text, /Company 2: —/);

    assert.equal(calls[0].cards.length, 3);
  } finally {
    await close();
  }
});

test("meredian_custom_column accumulates multiple columns rather than overwriting", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(3));
  const { pipeline } = analysisPipeline();
  const { client, close } = await connectTestClient(WITH_KEY, { store, pipeline });
  try {
    await client.callTool({
      name: "meredian_custom_column",
      arguments: { shortlistId, query: "CEO" },
    });
    await client.callTool({
      name: "meredian_custom_column",
      arguments: { shortlistId, query: "HQ city" },
    });

    const card = store.getShortlist(shortlistId).cards[0];
    assert.equal(card.custom_columns.CEO, "Jane Doe");
    assert.equal(card.custom_columns["HQ city"], "Jane Doe");
    assert.deepEqual(store.getShortlist(shortlistId).customColumns, ["CEO", "HQ city"]);
  } finally {
    await close();
  }
});

test("meredian_custom_column reports a missing API key clearly", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(2));
  const { pipeline, calls } = analysisPipeline();
  const { client, close } = await connectTestClient(
    { GEMINI_API_KEY: undefined },
    { store, pipeline }
  );
  try {
    const result = await client.callTool({
      name: "meredian_custom_column",
      arguments: { shortlistId, query: "CEO" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /GEMINI_API_KEY is not set/);
    assert.equal(calls.length, 0, "must not attempt research without a key");
  } finally {
    await close();
  }
});

test("meredian_custom_column rejects an unknown or empty shortlist", async () => {
  const store = new ResultStore();
  const emptyId = store.putShortlist({ ...makeShortlistInput(0), cards: [] });
  const { pipeline } = analysisPipeline();
  const { client, close } = await connectTestClient(WITH_KEY, { store, pipeline });
  try {
    const unknown = await client.callTool({
      name: "meredian_custom_column",
      arguments: { shortlistId: "s99", query: "CEO" },
    });
    assert.equal(unknown.isError, true);
    assert.match(unknown.content[0].text, /No shortlist found with id "s99"/);

    const empty = await client.callTool({
      name: "meredian_custom_column",
      arguments: { shortlistId: emptyId, query: "CEO" },
    });
    assert.equal(empty.isError, true);
    assert.match(empty.content[0].text, /is empty, so there is nothing to research/);
  } finally {
    await close();
  }
});

test("meredian_custom_column enforces the upstream query length limit", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(1));
  const { pipeline, calls } = analysisPipeline();
  const { client, close } = await connectTestClient(WITH_KEY, { store, pipeline });
  try {
    const result = await client.callTool({
      name: "meredian_custom_column",
      arguments: { shortlistId, query: "x".repeat(201) },
    });
    assert.equal(result.isError, true);
    assert.equal(calls.length, 0, "over-long query must be refused before the LLM call");
  } finally {
    await close();
  }
});

test("meredian_custom_column surfaces upstream validation failures", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(2));
  const { pipeline } = analysisPipeline({
    extractCustomColumn: async () => {
      const err = new Error("No company domains found in cards");
      err.status = 400;
      throw err;
    },
  });
  const { client, close } = await connectTestClient(WITH_KEY, { store, pipeline });
  try {
    const result = await client.callTool({
      name: "meredian_custom_column",
      arguments: { shortlistId, query: "CEO" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No company domains found in cards/);
  } finally {
    await close();
  }
});

test("meredian_custom_column streams per-company progress", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(3));
  const { pipeline } = analysisPipeline();
  const { client, close } = await connectTestClient(WITH_KEY, { store, pipeline });
  const seen = [];
  try {
    await client.callTool(
      { name: "meredian_custom_column", arguments: { shortlistId, query: "CEO" } },
      undefined,
      { onprogress: (p) => seen.push(p) }
    );
    assert.ok(seen.length >= 1);
    assert.match(seen[0].message, /Researching custom column/);
  } finally {
    await close();
  }
});

// --- general info ----------------------------------------------------------

test("meredian_general_info answers without touching the discovery pipeline", async () => {
  const { pipeline, calls } = analysisPipeline();
  const { client, close } = await connectTestClient(WITH_KEY, { pipeline });
  try {
    const result = await client.callTool({
      name: "meredian_general_info",
      arguments: { question: "How is EBITDA adjusted in a buy-and-build?" },
    });

    assert.equal(result.isError ?? false, false);
    assert.match(result.content[0].text, /EBITDA is adjusted for one-off costs/);
    assert.equal(
      result.structuredContent.question,
      "How is EBITDA adjusted in a buy-and-build?"
    );
    assert.equal(calls[0].fn, "answerGeneralInfo");
  } finally {
    await close();
  }
});

test("meredian_general_info rejects an empty question", async () => {
  const { pipeline } = analysisPipeline();
  const { client, close } = await connectTestClient(WITH_KEY, { pipeline });
  try {
    const result = await client.callTool({
      name: "meredian_general_info",
      arguments: { question: "  " },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /`question` cannot be empty/);
  } finally {
    await close();
  }
});
