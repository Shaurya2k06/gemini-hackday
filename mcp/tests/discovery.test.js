import test from "node:test";
import assert from "node:assert/strict";
import { ResultStore } from "../src/store.js";
import { connectTestClient } from "./helpers/test-client.js";
import { makeCard, makeShortlistInput, makeStructuredMandate } from "./helpers/fixtures.js";

function discoveryPipeline(overrides = {}) {
  const calls = [];
  return {
    calls,
    pipeline: {
      handleDiscoverStream: async (args) => {
        calls.push({ fn: "handleDiscoverStream", args });
        args.onProgress?.({ step: "Searching", detail: null, at: Date.now() });
        args.onProgress?.({ step: "Enriching", detail: "3 candidates", at: Date.now() });
        return {
          structured: args.structured,
          ranked: {},
          cards: [
            makeCard({ rank: 1, fields: { name: "Alpha", domain: "alpha.example" } }),
            makeCard({ rank: 2, fields: { name: "Beta", domain: "beta.example" } }),
          ],
          other_cards: [
            makeCard({
              rank: 3,
              gate_reason: "listed incumbent",
              fields: { name: "Gated Co", domain: "gated.example" },
            }),
          ],
          dataSource: "openai_search",
          heavySearchRan: true,
          pipeline_stages: [{ stage: "search" }],
          message: null,
        };
      },
      handleDiscoverExpandStream: async (args) => {
        calls.push({ fn: "handleDiscoverExpandStream", args });
        return {
          structured: args.structured,
          cards: [
            makeCard({ rank: 99, fields: { name: "Gamma", domain: "gamma.example" } }),
            makeCard({ rank: 100, fields: { name: "Delta", domain: "delta.example" } }),
          ],
          addedCount: 2,
          dataSource: "openai_search",
          pipeline_stages: [],
          message: null,
        };
      },
      ...overrides,
    },
  };
}

test("zoron_discover stores a shortlist and summarizes it compactly", async () => {
  const store = new ResultStore();
  const mandateId = store.putMandate({
    structured: makeStructuredMandate(),
    pills: [],
    intent: "mandate_search",
    accumulatedText: "european b2b saas",
  });
  const { pipeline, calls } = discoveryPipeline();
  const { client, close } = await connectTestClient({}, { store, pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_discover",
      arguments: { mandateId },
    });

    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.shortlistId, "s1");
    assert.equal(result.structuredContent.count, 2);
    assert.equal(result.structuredContent.gatedCount, 1);
    assert.equal(result.structuredContent.heavySearchRan, true);
    assert.equal(result.structuredContent.resourceUri, "zoron://shortlist/s1");

    // Summary lists companies but defers the full payload to the resource.
    const text = result.content[0].text;
    assert.match(text, /Alpha \(alpha\.example\)/);
    assert.match(text, /Beta \(beta\.example\)/);
    assert.match(text, /Gated Co .*listed incumbent/);
    assert.match(text, /zoron:\/\/shortlist\/s1/);
    assert.ok(text.length < 2000, "summary must stay compact");

    // The mandate's own text is used as the raw query when none is passed.
    assert.equal(calls[0].args.rawQuery, "european b2b saas");
    assert.ok(store.getShortlist("s1"));
  } finally {
    await close();
  }
});

test("zoron_discover accepts an inline structured mandate", async () => {
  const { pipeline, calls } = discoveryPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_discover",
      arguments: { structured: makeStructuredMandate(), rawQuery: "explicit query" },
    });
    assert.equal(result.structuredContent.shortlistId, "s1");
    assert.equal(calls[0].args.rawQuery, "explicit query");
  } finally {
    await close();
  }
});

test("zoron_discover forwards constraintMode", async () => {
  const { pipeline, calls } = discoveryPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    await client.callTool({
      name: "zoron_discover",
      arguments: { structured: makeStructuredMandate(), constraintMode: "lite" },
    });
    assert.equal(calls[0].args.constraintMode, "lite");
  } finally {
    await close();
  }
});

test("zoron_discover requires a mandate reference", async () => {
  const { pipeline } = discoveryPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    // Tool-handler throws are reported as isError results, per MCP tool
    // semantics, so the model can read the guidance and retry.
    const missing = await client.callTool({ name: "zoron_discover", arguments: {} });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /Provide either `mandateId`/);
    assert.match(missing.content[0].text, /inline `structured`/);

    const unknown = await client.callTool({
      name: "zoron_discover",
      arguments: { mandateId: "m99" },
    });
    assert.equal(unknown.isError, true);
    assert.match(unknown.content[0].text, /No mandate found with id "m99"/);
    assert.match(unknown.content[0].text, /zoron_parse_mandate/);
  } finally {
    await close();
  }
});

test("pipeline failures during discovery surface as recoverable errors", async () => {
  const { pipeline } = discoveryPipeline({
    handleDiscoverStream: async () => {
      // mapPipelineError produces user-facing text like this.
      throw new Error("Heavy search is unavailable. Try again shortly.");
    },
  });
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_discover",
      arguments: { structured: makeStructuredMandate() },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Heavy search is unavailable/);
  } finally {
    await close();
  }
});

test("zoron_discover reports progress when the client supplies a token", async () => {
  const { pipeline } = discoveryPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  const seen = [];
  try {
    await client.callTool(
      { name: "zoron_discover", arguments: { structured: makeStructuredMandate() } },
      undefined,
      { onprogress: (p) => seen.push(p) }
    );

    assert.ok(seen.length >= 1, "expected at least one progress notification");
    assert.match(seen[0].message, /Searching/);
  } finally {
    await close();
  }
});

// --- expansion -------------------------------------------------------------

test("zoron_expand_shortlist derives existing domains and continues ranks", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(3));
  const { pipeline, calls } = discoveryPipeline();
  const { client, close } = await connectTestClient({}, { store, pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_expand_shortlist",
      arguments: { shortlistId, additionalCount: 2 },
    });

    assert.equal(result.isError ?? false, false);

    // Caller passed no domains; the tool must supply them from stored state.
    const call = calls.find((c) => c.fn === "handleDiscoverExpandStream");
    assert.deepEqual(call.args.existingDomains, ["co1.example", "co2.example", "co3.example"]);
    assert.equal(call.args.additionalCount, 2);

    // Incoming cards had ranks 99/100; they must be renumbered onto the tail.
    const entry = store.getShortlist(shortlistId);
    assert.equal(entry.cards.length, 5);
    assert.deepEqual(
      entry.cards.map((c) => c.rank),
      [1, 2, 3, 4, 5]
    );
    assert.equal(entry.cards[3].fields.name, "Gamma");

    assert.equal(result.structuredContent.addedCount, 2);
    assert.equal(result.structuredContent.totalCount, 5);
    assert.equal(result.structuredContent.excludedDomains, 3);
    assert.match(result.content[0].text, /Added 2 companies/);
    assert.match(result.content[0].text, /Gamma \(gamma\.example\)/);

    // Only the newly added companies are listed, not the whole shortlist.
    assert.doesNotMatch(result.content[0].text, /Company 1/);
  } finally {
    await close();
  }
});

test("zoron_expand_shortlist reuses the mandate the shortlist was built from", async () => {
  const store = new ResultStore();
  const input = makeShortlistInput(2);
  const shortlistId = store.putShortlist(input);
  const { pipeline, calls } = discoveryPipeline();
  const { client, close } = await connectTestClient({}, { store, pipeline });
  try {
    await client.callTool({
      name: "zoron_expand_shortlist",
      arguments: { shortlistId },
    });
    const call = calls.find((c) => c.fn === "handleDiscoverExpandStream");
    assert.deepEqual(call.args.structured, input.structured);
    assert.equal(call.args.rawQuery, "german logistics saas");
    assert.equal(call.args.additionalCount, 5, "defaults to 5");
  } finally {
    await close();
  }
});

test("zoron_expand_shortlist explains an empty expansion", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(2));
  const { pipeline } = discoveryPipeline({
    handleDiscoverExpandStream: async () => ({ cards: [], addedCount: 0, message: null }),
  });
  const { client, close } = await connectTestClient({}, { store, pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_expand_shortlist",
      arguments: { shortlistId },
    });
    assert.equal(result.structuredContent.addedCount, 0);
    assert.equal(result.structuredContent.totalCount, 2);
    assert.match(result.content[0].text, /No additional companies matched/);
  } finally {
    await close();
  }
});

test("zoron_expand_shortlist rejects an unknown shortlist id", async () => {
  const { pipeline } = discoveryPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_expand_shortlist",
      arguments: { shortlistId: "s99" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /No shortlist found with id "s99"/);
    assert.match(result.content[0].text, /zoron_discover/);
  } finally {
    await close();
  }
});
