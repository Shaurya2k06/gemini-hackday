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
