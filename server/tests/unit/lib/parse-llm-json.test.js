import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLlmJson, extractJsonObject } from "../../../src/lib/parse-llm-json.js";

test("parseLlmJson parses valid JSON unchanged", () => {
  const { parsed, repaired } = parseLlmJson('{"companies":[{"name":"Acme","domain":"acme.com"}]}');
  assert.equal(repaired, false);
  assert.equal(parsed.companies.length, 1);
});

test("parseLlmJson repairs bare unknown tokens", () => {
  const raw =
    '{"companies":[{"name":"Stripe","domain":"stripe.com","founded_year":unknown,"funding_stage":"unknown"}]}';
  const { parsed, repaired } = parseLlmJson(raw);
  assert.equal(repaired, true);
  assert.equal(parsed.companies[0].founded_year, null);
  assert.equal(parsed.companies[0].funding_stage, "unknown");
});

test("parseLlmJson repairs trailing commas", () => {
  const raw = '{"companies":[{"name":"Acme","domain":"acme.com",},]}';
  const { parsed, repaired } = parseLlmJson(raw);
  assert.equal(repaired, true);
  assert.equal(parsed.companies[0].name, "Acme");
});

test("parseLlmJson strips markdown fences", () => {
  const raw = '```json\n{"companies":[{"name":"Acme","domain":"acme.com"}]}\n```';
  const parsed = extractJsonObject(raw);
  assert.equal(parsed.companies[0].domain, "acme.com");
});

test("parseLlmJson throws on unrecoverable JSON", () => {
  assert.throws(
    () => parseLlmJson("not json at all"),
    /No JSON object in model response|Invalid JSON in model response/
  );
});

// --- truncation recovery ---------------------------------------------------
// Grounded search spends output budget on reasoning tokens and can be cut off
// mid-list. Complete records that did arrive must survive.

test("parseLlmJson salvages a list truncated mid-object", () => {
  const raw =
    '{"companies":[' +
    '{"name":"Alpha","domain":"alpha.com"},' +
    '{"name":"Beta","domain":"beta.com"},' +
    '{"name":"Gamma","domain":"gam';

  const { parsed, truncated } = parseLlmJson(raw);
  assert.equal(truncated, true);
  assert.equal(parsed.companies.length, 2, "keeps the two complete records");
  assert.deepEqual(
    parsed.companies.map((c) => c.name),
    ["Alpha", "Beta"]
  );
});

test("parseLlmJson salvages a list truncated after a complete object", () => {
  const raw =
    '{"companies":[{"name":"Alpha","domain":"alpha.com"},{"name":"Beta","domain":"beta.com"}';
  const { parsed, truncated } = parseLlmJson(raw);
  assert.equal(truncated, true);
  assert.equal(parsed.companies.length, 2);
});

test("parseLlmJson salvages truncated output inside an unterminated fence", () => {
  const raw =
    '```json\n{"companies":[{"name":"Alpha","domain":"alpha.com"},{"name":"Bet';
  const { parsed, truncated } = parseLlmJson(raw);
  assert.equal(truncated, true);
  assert.equal(parsed.companies.length, 1);
  assert.equal(parsed.companies[0].name, "Alpha");
});

test("parseLlmJson does not flag complete responses as truncated", () => {
  const { truncated } = parseLlmJson('{"companies":[{"name":"Acme","domain":"acme.com"}]}');
  assert.equal(truncated, false);
});

test("parseLlmJson preserves braces inside string values when salvaging", () => {
  const raw =
    '{"companies":[{"name":"Alpha","description":"Uses {curly} braces, [brackets]"},{"name":"Bet';
  const { parsed, truncated } = parseLlmJson(raw);
  assert.equal(truncated, true);
  assert.equal(parsed.companies.length, 1);
  assert.equal(parsed.companies[0].description, "Uses {curly} braces, [brackets]");
});
