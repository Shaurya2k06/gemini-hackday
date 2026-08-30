import test from "node:test";
import assert from "node:assert/strict";
import { ResultStore } from "../src/store.js";
import { connectTestClient } from "./helpers/test-client.js";
import { makeShortlistInput, makeStructuredMandate, makeCard } from "./helpers/fixtures.js";

async function withSeededServer(seed) {
  const store = new ResultStore();
  const ids = seed(store);
  const ctx = await connectTestClient({}, { store });
  return { ...ctx, ids, store };
}

test("resource templates are advertised", async () => {
  const { client, close } = await connectTestClient();
  try {
    const { resourceTemplates } = await client.listResourceTemplates();
    assert.deepEqual(resourceTemplates.map((t) => t.uriTemplate).sort(), [
      "zoron://dossier/{domain}",
      "zoron://mandate/{id}",
      "zoron://shortlist/{id}",
      "zoron://shortlist/{id}/company/{domain}",
    ]);
  } finally {
    await close();
  }
});

test("reading a seeded shortlist returns the full payload as JSON", async () => {
  const { client, close, ids } = await withSeededServer((store) => ({
    shortlist: store.putShortlist(makeShortlistInput(3)),
  }));
  try {
    const result = await client.readResource({ uri: `zoron://shortlist/${ids.shortlist}` });

    assert.equal(result.contents.length, 1);
    assert.equal(result.contents[0].mimeType, "application/json");
    const payload = JSON.parse(result.contents[0].text);
    assert.equal(payload.id, ids.shortlist);
    assert.equal(payload.cards.length, 3);
    assert.equal(payload.cards[0].fields.domain, "co1.example");
  } finally {
    await close();
  }
});

test("reading a seeded mandate returns structured criteria", async () => {
  const { client, close, ids } = await withSeededServer((store) => ({
    mandate: store.putMandate({
      structured: makeStructuredMandate(),
      pills: [{ category: "Geography", label: "Europe", value: "Europe" }],
      intent: "mandate_search",
      accumulatedText: "european b2b saas",
    }),
  }));
  try {
    const result = await client.readResource({ uri: `zoron://mandate/${ids.mandate}` });
    const payload = JSON.parse(result.contents[0].text);
    assert.equal(payload.intent, "mandate_search");
    assert.deepEqual(payload.structured.geography, ["Europe"]);
    assert.equal(payload.pills[0].label, "Europe");
  } finally {
    await close();
  }
});

test("a single company can be read out of a shortlist by domain", async () => {
  const { client, close, ids } = await withSeededServer((store) => ({
    shortlist: store.putShortlist(makeShortlistInput(3)),
  }));
  try {
    const result = await client.readResource({
      uri: `zoron://shortlist/${ids.shortlist}/company/co2.example`,
    });
    assert.equal(JSON.parse(result.contents[0].text).fields.name, "Company 2");
  } finally {
    await close();
  }
});

test("dossier resource is readable by normalized domain", async () => {
  const { client, close } = await withSeededServer((store) => {
    store.putDossier("acme.example", { dossier: makeCard(), enrichmentSuccess: true });
    return {};
  });
  try {
    const result = await client.readResource({ uri: "zoron://dossier/acme.example" });
    const payload = JSON.parse(result.contents[0].text);
    assert.equal(payload.domain, "acme.example");
    assert.equal(payload.enrichmentSuccess, true);
  } finally {
    await close();
  }
});

test("unknown ids produce a clean protocol error, not a crash", async () => {
  const { client, close } = await connectTestClient();
  try {
    await assert.rejects(
      () => client.readResource({ uri: "zoron://shortlist/does-not-exist" }),
      /No shortlist found with id "does-not-exist"/
    );
    await assert.rejects(
      () => client.readResource({ uri: "zoron://mandate/nope" }),
      /No mandate found with id "nope"/
    );
    await assert.rejects(
      () => client.readResource({ uri: "zoron://dossier/nothing.example" }),
      /No dossier found with id "nothing.example"/
    );

    // Server must still be responsive after the failed reads.
    const { tools } = await client.listTools();
    assert.ok(tools.length > 0);
  } finally {
    await close();
  }
});

test("requesting a missing company from an existing shortlist is a clear error", async () => {
  const { client, close, ids } = await withSeededServer((store) => ({
    shortlist: store.putShortlist(makeShortlistInput(2)),
  }));
  try {
    await assert.rejects(
      () =>
        client.readResource({
          uri: `zoron://shortlist/${ids.shortlist}/company/absent.example`,
        }),
      /has no company with domain "absent\.example"/
    );
  } finally {
    await close();
  }
});
