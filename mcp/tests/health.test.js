import test from "node:test";
import assert from "node:assert/strict";
import { connectTestClient } from "./helpers/test-client.js";

test("server advertises meredian_health", async () => {
  const { client, close } = await connectTestClient();
  try {
    assert.equal(client.getServerVersion().name, "meredian");
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    assert.ok(names.includes("meredian_health"), `expected meredian_health in ${names}`);
  } finally {
    await close();
  }
});

test("meredian_health reports pipeline import and configuration", async () => {
  const { client, close } = await connectTestClient({
    GEMINI_API_KEY: "sk-test-key",
    SKIP_HEAVY_SEARCH: "true",
  });
  try {
    const result = await client.callTool({ name: "meredian_health", arguments: {} });

    assert.equal(result.isError ?? false, false);
    assert.equal(
      result.structuredContent.pipelineImport,
      "ok",
      "pipeline must import in-process without Mongo"
    );
    assert.equal(result.structuredContent.geminiKeyPresent, true);
    assert.equal(result.structuredContent.skipHeavySearch, true);
    assert.equal(result.structuredContent.ready, true);
    assert.match(result.content[0].text, /Meredian MCP server ready/);
  } finally {
    await close();
  }
});

test("meredian_health flags a missing Gemini key", async () => {
  const { client, close } = await connectTestClient({ GEMINI_API_KEY: undefined });
  try {
    const result = await client.callTool({ name: "meredian_health", arguments: {} });
    assert.equal(result.structuredContent.geminiKeyPresent, false);
    assert.equal(result.structuredContent.ready, false);
    assert.match(result.content[0].text, /NOT ready/);
  } finally {
    await close();
  }
});
