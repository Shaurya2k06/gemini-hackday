import test from "node:test";
import assert from "node:assert/strict";
import { ResultStore, normalizeDomain } from "../src/store.js";
import { makeCard, makeShortlistInput } from "./helpers/fixtures.js";

test("mandate round-trip yields sequential ids", () => {
  const store = new ResultStore();
  const a = store.putMandate({ structured: { intent: "mandate_search" }, pills: [] });
  const b = store.putMandate({ structured: { intent: "company_lookup" }, pills: [] });

  assert.equal(a, "m1");
  assert.equal(b, "m2");
  assert.equal(store.getMandate("m1").structured.intent, "mandate_search");
  assert.equal(store.getMandate("m2").structured.intent, "company_lookup");
  assert.equal(store.getMandate("nope"), undefined);
});

test("shortlist round-trip preserves cards and metadata", () => {
  const store = new ResultStore();
  const id = store.putShortlist(makeShortlistInput(3));

  assert.equal(id, "s1");
  const entry = store.getShortlist(id);
  assert.equal(entry.cards.length, 3);
  assert.equal(entry.dataSource, "openai_search");
  assert.deepEqual(entry.customColumns, []);
});

test("shortlistDomains extracts domains for expansion dedupe", () => {
  const store = new ResultStore();
  const id = store.putShortlist(makeShortlistInput(3));
  assert.deepEqual(store.shortlistDomains(id), ["co1.example", "co2.example", "co3.example"]);
  assert.deepEqual(store.shortlistDomains("missing"), []);
});

test("appendToShortlist continues rank numbering from the tail", () => {
  const store = new ResultStore();
  const id = store.putShortlist(makeShortlistInput(3));

  // Incoming cards carry stale ranks; the store must renumber them.
  store.appendToShortlist(id, [
    makeCard({ rank: 1, fields: { name: "New A", domain: "new-a.example" } }),
    makeCard({ rank: 2, fields: { name: "New B", domain: "new-b.example" } }),
  ]);

  const entry = store.getShortlist(id);
  assert.equal(entry.cards.length, 5);
  assert.deepEqual(
    entry.cards.map((c) => c.rank),
    [1, 2, 3, 4, 5]
  );
  assert.equal(entry.cards[3].fields.name, "New A");
});

test("replaceShortlistCards records the custom column label once", () => {
  const store = new ResultStore();
  const id = store.putShortlist(makeShortlistInput(2));
  const cards = store.getShortlist(id).cards;

  store.replaceShortlistCards(id, cards, { columnLabel: "CEO" });
  store.replaceShortlistCards(id, cards, { columnLabel: "CEO" });
  store.replaceShortlistCards(id, cards, { columnLabel: "HQ" });

  assert.deepEqual(store.getShortlist(id).customColumns, ["CEO", "HQ"]);
});

test("findCard matches regardless of protocol, www prefix or case", () => {
  const store = new ResultStore();
  const id = store.putShortlist(makeShortlistInput(2));

  assert.ok(store.findCard(id, "co2.example"));
  assert.ok(store.findCard(id, "https://www.CO2.example/path"));
  assert.equal(store.findCard(id, "unknown.example"), undefined);
});

test("dossiers are keyed by normalized domain", () => {
  const store = new ResultStore();
  store.putDossier("https://WWW.Acme.example/", { dossier: makeCard() });

  assert.ok(store.getDossier("acme.example"));
  assert.equal(store.getDossier("acme.example").domain, "acme.example");
  assert.ok(store.getDossier("www.acme.example"));
});

test("bounded maps evict least-recently-used entries", () => {
  const store = new ResultStore({ shortlists: 2 });
  const a = store.putShortlist(makeShortlistInput(1));
  const b = store.putShortlist(makeShortlistInput(1));

  // Touch `a` so `b` becomes the eviction candidate.
  store.getShortlist(a);
  const c = store.putShortlist(makeShortlistInput(1));

  assert.ok(store.getShortlist(a), "recently used entry should survive");
  assert.equal(store.getShortlist(b), undefined, "LRU entry should be evicted");
  assert.ok(store.getShortlist(c));
  assert.equal(store.stats().shortlists, 2);
});

test("normalizeDomain strips scheme, www, path and case", () => {
  assert.equal(normalizeDomain("https://www.Example.com/a/b"), "example.com");
  assert.equal(normalizeDomain("  EXAMPLE.com "), "example.com");
  assert.equal(normalizeDomain(null), "");
});
