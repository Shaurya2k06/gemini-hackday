import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { connectTestClient } from "./helpers/test-client.js";
import * as realPipeline from "../src/pipeline.js";
import { makeCard, makeStructuredMandate } from "./helpers/fixtures.js";

/** Every tool the server is expected to expose. */
const EXPECTED_TOOLS = [
  "zoron_custom_column",
  "zoron_deep_dive",
  "zoron_discover",
  "zoron_expand_shortlist",
  "zoron_export_shortlist",
  "zoron_general_info",
  "zoron_health",
  "zoron_lookup_company",
  "zoron_parse_mandate",
  "zoron_parse_thesis_pdf",
];

test("the full tool surface is registered, with no extras", async () => {
  const { client, close } = await connectTestClient();
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), EXPECTED_TOOLS);
  } finally {
    await close();
  }
});

test("every tool carries a description and an input schema", async () => {
  const { client, close } = await connectTestClient();
  try {
    const { tools } = await client.listTools();
    for (const tool of tools) {
      assert.ok(tool.description?.length > 40, `${tool.name} needs a usable description`);
      assert.ok(tool.inputSchema, `${tool.name} is missing an inputSchema`);
      assert.equal(tool.inputSchema.type, "object", `${tool.name} schema must be an object`);
    }
  } finally {
    await close();
  }
});

test("prompts are registered with arguments", async () => {
  const { client, close } = await connectTestClient();
  try {
    const { prompts } = await client.listPrompts();
    assert.deepEqual(prompts.map((p) => p.name).sort(), ["company_dossier", "screen_mandate"]);

    const screen = prompts.find((p) => p.name === "screen_mandate");
    assert.ok(screen.arguments.some((a) => a.name === "criteria" && a.required));
  } finally {
    await close();
  }
});

test("screen_mandate prompt renders an ordered workflow", async () => {
  const { client, close } = await connectTestClient();
  try {
    const result = await client.getPrompt({
      name: "screen_mandate",
      arguments: { criteria: "German industrial software, founder-owned" },
    });
    const text = result.messages[0].content.text;
    assert.match(text, /German industrial software, founder-owned/);
    // The prompt must name the tools in the order they should be called.
    assert.ok(
      text.indexOf("zoron_parse_mandate") < text.indexOf("zoron_discover"),
      "parse must be instructed before discover"
    );
    assert.match(text, /zoron_expand_shortlist/);
  } finally {
    await close();
  }
});

test("company_dossier prompt threads a focused question through", async () => {
  const { client, close } = await connectTestClient();
  try {
    const result = await client.getPrompt({
      name: "company_dossier",
      arguments: { company: "Personio", question: "is it PE-backed?" },
    });
    const text = result.messages[0].content.text;
    assert.match(text, /zoron_lookup_company/);
    assert.match(text, /userQuestion: "is it PE-backed\?"/);
  } finally {
    await close();
  }
});

test("end-to-end: discover, deep dive, custom column, export", async () => {
  // A stub standing in for the OpenAI-backed steps, with the real store,
  // resources, formatters and export code doing their actual work.
  const pipeline = {
    ...realPipeline,
    handleMandateParse: async ({ text }) => ({
      intent: "mandate_search",
      structured: makeStructuredMandate({ raw_query: text }),
      pills: [{ category: "Geography", label: "Europe", field: "geography", value: "Europe" }],
      accumulatedText: text,
    }),
    handleDiscoverStream: async ({ structured }) => ({
      structured,
      cards: [
        makeCard({ rank: 1, fields: { name: "Alpha", domain: "alpha.example" } }),
        makeCard({ rank: 2, fields: { name: "Beta", domain: "beta.example" } }),
      ],
      other_cards: [],
      dataSource: "openai_search",
      heavySearchRan: true,
      pipeline_stages: [],
      message: null,
    }),
    handleDeepDiveStream: async ({ company }) => ({
      dossier: makeCard({ fields: { name: "Alpha", domain: company.domain } }),
      company: { ...company, name: "Alpha" },
      enrichmentSuccess: true,
    }),
    extractCustomColumn: async (cards, query) => ({
      query,
      label: query,
      results: { "alpha.example": "Jane Doe", "beta.example": "Sam Patel" },
    }),
  };

  const { client, close } = await connectTestClient(
    { GEMINI_API_KEY: "sk-test-key" },
    { pipeline }
  );
  let exportedPath;
  try {
    const parsed = await client.callTool({
      name: "zoron_parse_mandate",
      arguments: { text: "european b2b saas, founder-owned" },
    });
    const { mandateId } = parsed.structuredContent;
    assert.equal(mandateId, "m1");

    const discovered = await client.callTool({
      name: "zoron_discover",
      arguments: { mandateId },
    });
    const { shortlistId } = discovered.structuredContent;
    assert.equal(discovered.structuredContent.count, 2);

    // The shortlist is reachable as a resource.
    const resource = await client.readResource({ uri: `zoron://shortlist/${shortlistId}` });
    assert.equal(JSON.parse(resource.contents[0].text).cards.length, 2);

    const dive = await client.callTool({
      name: "zoron_deep_dive",
      arguments: { shortlistId, domain: "alpha.example" },
    });
    assert.equal(dive.structuredContent.domain, "alpha.example");
    const dossier = await client.readResource({ uri: "zoron://dossier/alpha.example" });
    assert.equal(JSON.parse(dossier.contents[0].text).enrichmentSuccess, true);

    const column = await client.callTool({
      name: "zoron_custom_column",
      arguments: { shortlistId, query: "CEO" },
    });
    assert.equal(column.structuredContent.resolvedCount, 2);

    const exported = await client.callTool({
      name: "zoron_export_shortlist",
      arguments: { shortlistId, format: "csv" },
    });
    exportedPath = exported.structuredContent.path;

    // The researched column must survive into the exported file.
    const csv = await fs.readFile(exportedPath, "utf8");
    assert.ok(realPipeline.isValidCsv(csv));
    assert.ok(csv.split("\n")[0].endsWith(",CEO"), "custom column missing from CSV header");
    assert.match(csv, /Jane Doe/);
    assert.match(csv, /Sam Patel/);
  } finally {
    await close();
    if (exportedPath) await fs.rm(exportedPath, { force: true });
  }
});
