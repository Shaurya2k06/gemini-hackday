import test from "node:test";
import assert from "node:assert/strict";
import { ResultStore } from "../src/store.js";
import { connectTestClient } from "./helpers/test-client.js";
import { makeCard, makeShortlistInput, makeStructuredMandate } from "./helpers/fixtures.js";

function companyPipeline(overrides = {}) {
  const calls = [];
  return {
    calls,
    pipeline: {
      resolveCompanyLookup: async (args) => {
        calls.push({ fn: "resolveCompanyLookup", args });
        args.onProgress?.({ step: "Looking up company…", detail: null, at: Date.now() });
        return {
          found: true,
          domain: "personio.de",
          company: { domain: "personio.de", name: "Personio" },
          card: makeCard({ fields: { name: "Personio", domain: "personio.de" } }),
          structured: args.structured,
        };
      },
      handleDeepDiveStream: async (args) => {
        calls.push({ fn: "handleDeepDiveStream", args });
        args.onProgress?.({ step: "Opening dossier", detail: args.company?.name, at: Date.now() });
        return {
          dossier: makeCard({
            rank: 1,
            investment_summary: "Founder-led, strong retention, no PE on the cap table.",
            fields: { name: "Acme Analytics", domain: args.company.domain },
          }),
          company: { ...args.company, name: "Acme Analytics" },
          enrichmentSuccess: true,
        };
      },
      ...overrides,
    },
  };
}

// --- lookup ----------------------------------------------------------------

test("zoron_lookup_company resolves a name and caches the result", async () => {
  const { pipeline, calls } = companyPipeline();
  const { client, store, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_lookup_company",
      arguments: { companyName: "Personio" },
    });

    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.found, true);
    assert.equal(result.structuredContent.domain, "personio.de");
    assert.equal(result.structuredContent.resourceUri, "zoron://dossier/personio.de");
    assert.match(result.content[0].text, /Found Personio \(personio\.de\)/);
    assert.match(result.content[0].text, /zoron_deep_dive/);

    // The pipeline gate needs intent company_lookup plus company_names.
    const { args } = calls[0];
    assert.equal(args.structured.intent, "company_lookup");
    assert.deepEqual(args.structured.company_names, ["Personio"]);

    assert.ok(store.getDossier("personio.de"), "result should be cached for deep dive");
  } finally {
    await close();
  }
});

test("zoron_lookup_company merges optional mandate context into the search", async () => {
  const { pipeline, calls } = companyPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    await client.callTool({
      name: "zoron_lookup_company",
      arguments: { companyName: "Acme", structured: makeStructuredMandate() },
    });
    const { args } = calls[0];
    assert.deepEqual(args.structured.geography, ["Europe"]);
    // Intent must still be overridden to company_lookup.
    assert.equal(args.structured.intent, "company_lookup");
  } finally {
    await close();
  }
});

test("a lookup miss is an informative answer, not an error", async () => {
  const { pipeline } = companyPipeline({
    resolveCompanyLookup: async () => ({
      found: false,
      message: "Could not find that company.",
    }),
  });
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_lookup_company",
      arguments: { companyName: "Nonexistent Ltd" },
    });

    assert.equal(result.isError ?? false, false, "a miss must not be flagged as an error");
    assert.equal(result.structuredContent.found, false);
    assert.match(result.content[0].text, /Could not find that company/);
  } finally {
    await close();
  }
});

test("zoron_lookup_company rejects an empty name", async () => {
  const { pipeline } = companyPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_lookup_company",
      arguments: { companyName: "   " },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /`companyName` cannot be empty/);
  } finally {
    await close();
  }
});

// --- deep dive -------------------------------------------------------------

test("zoron_deep_dive resolves a company from a shortlist and stores the dossier", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(3));
  const { pipeline, calls } = companyPipeline();
  const { client, close } = await connectTestClient({}, { store, pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_deep_dive",
      arguments: { shortlistId, domain: "co2.example" },
    });

    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.domain, "co2.example");
    assert.equal(result.structuredContent.enrichmentSuccess, true);
    assert.equal(result.structuredContent.resourceUri, "zoron://dossier/co2.example");

    // The card's nested `fields` must be flattened into a company object.
    const call = calls.find((c) => c.fn === "handleDeepDiveStream");
    assert.equal(call.args.company.domain, "co2.example");
    assert.equal(call.args.company.name, "Company 2");
    // And mandate context comes from the shortlist.
    assert.equal(call.args.structured.intent, "mandate_search");

    assert.ok(store.getDossier("co2.example"));
    assert.match(result.content[0].text, /Dossier — Acme Analytics/);
    assert.match(result.content[0].text, /Investment view:/);
  } finally {
    await close();
  }
});

test("zoron_deep_dive passes a targeted userQuestion through", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(1));
  const { pipeline, calls } = companyPipeline();
  const { client, close } = await connectTestClient({}, { store, pipeline });
  try {
    await client.callTool({
      name: "zoron_deep_dive",
      arguments: {
        shortlistId,
        domain: "co1.example",
        userQuestion: "Who currently owns the business?",
      },
    });
    const call = calls.find((c) => c.fn === "handleDeepDiveStream");
    assert.equal(call.args.userQuestion, "Who currently owns the business?");
  } finally {
    await close();
  }
});

test("zoron_deep_dive accepts a bare domain with no shortlist", async () => {
  const { pipeline, calls } = companyPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_deep_dive",
      arguments: { domain: "https://www.Standalone.example/about" },
    });
    assert.equal(result.isError ?? false, false);
    const call = calls.find((c) => c.fn === "handleDeepDiveStream");
    assert.equal(call.args.company.domain, "standalone.example", "domain must be normalized");
  } finally {
    await close();
  }
});

test("zoron_deep_dive reuses a company cached by an earlier lookup", async () => {
  const store = new ResultStore();
  store.putDossier("personio.de", {
    company: { domain: "personio.de", name: "Personio", employees_count: 2000 },
    dossier: makeCard({ fields: { name: "Personio", domain: "personio.de" } }),
    source: "lookup",
  });
  const { pipeline, calls } = companyPipeline();
  const { client, close } = await connectTestClient({}, { store, pipeline });
  try {
    await client.callTool({
      name: "zoron_deep_dive",
      arguments: { domain: "personio.de" },
    });
    const call = calls.find((c) => c.fn === "handleDeepDiveStream");
    assert.equal(call.args.company.employees_count, 2000, "cached company should be reused");
  } finally {
    await close();
  }
});

test("zoron_deep_dive requires a resolvable company", async () => {
  const { pipeline } = companyPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const noTarget = await client.callTool({ name: "zoron_deep_dive", arguments: {} });
    assert.equal(noTarget.isError, true);
    assert.match(noTarget.content[0].text, /Provide `domain`/);

    const badInline = await client.callTool({
      name: "zoron_deep_dive",
      arguments: { company: { name: "No Domain Co" } },
    });
    assert.equal(badInline.isError, true);
    assert.match(badInline.content[0].text, /must include a `domain`/);
  } finally {
    await close();
  }
});

test("zoron_deep_dive lists available domains when the requested one is absent", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(2));
  const { pipeline } = companyPipeline();
  const { client, close } = await connectTestClient({}, { store, pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_deep_dive",
      arguments: { shortlistId, domain: "absent.example" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /has no company with domain "absent\.example"/);
    assert.match(result.content[0].text, /Available: co1\.example, co2\.example/);
  } finally {
    await close();
  }
});

test("zoron_deep_dive flags incomplete enrichment instead of failing", async () => {
  const { pipeline } = companyPipeline({
    handleDeepDiveStream: async (args) => ({
      dossier: makeCard({ fields: { name: "Partial Co", domain: args.company.domain } }),
      company: args.company,
      enrichmentSuccess: false,
    }),
  });
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "zoron_deep_dive",
      arguments: { domain: "partial.example" },
    });
    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.enrichmentSuccess, false);
    assert.match(result.content[0].text, /live enrichment did not complete/);
  } finally {
    await close();
  }
});

test("zoron_deep_dive streams progress to the host", async () => {
  const { pipeline } = companyPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  const seen = [];
  try {
    await client.callTool(
      { name: "zoron_deep_dive", arguments: { domain: "acme.example" } },
      undefined,
      { onprogress: (p) => seen.push(p) }
    );
    assert.ok(seen.length >= 1);
    assert.match(seen[0].message, /Opening dossier/);
  } finally {
    await close();
  }
});
