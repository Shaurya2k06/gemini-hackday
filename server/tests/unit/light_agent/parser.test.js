import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseNaturalLanguageQuery } from "../../../src/light_agent/parser.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = path.join(
  __dirname,
  "../../fixtures/light_agent/queries.json"
);

const fixtures = JSON.parse(await readFile(FIXTURES_PATH, "utf8"));

function makeMockLlm(sequence) {
  let call = 0;
  return async () => {
    const response = sequence[Math.min(call, sequence.length - 1)];
    call += 1;
    return {
      content: JSON.stringify(response),
      latencyMs: 10,
      model: "mock",
    };
  };
}

for (const fixture of fixtures) {
  test(`parser fixture: ${fixture.id}`, async () => {
    const llmCaller = makeMockLlm([fixture.llm_output]);
    const { structured, attempts } = await parseNaturalLanguageQuery(
      fixture.input,
      { llmCaller }
    );

    assert.equal(structured.raw_query, fixture.input);
    assert.deepEqual(structured.sector_tags, fixture.llm_output.sector_tags);
    assert.deepEqual(structured.funding_stage, fixture.llm_output.funding_stage);
    assert.deepEqual(structured.geography, fixture.llm_output.geography);
    assert.equal(structured.intent, fixture.llm_output.intent);
    assert.deepEqual(structured.company_names, fixture.llm_output.company_names);
    assert.equal(structured.employees_min, fixture.llm_output.employees_min);
    assert.equal(structured.employees_max, fixture.llm_output.employees_max);
    assert.equal(attempts, 1);
  });
}

test("parser retries on malformed JSON then succeeds", async () => {
  const valid = fixtures[0].llm_output;
  const llmCaller = makeMockLlm(["{bad", valid]);
  const { structured, attempts } = await parseNaturalLanguageQuery(
    fixtures[0].input,
    { llmCaller }
  );

  assert.equal(attempts, 2);
  assert.deepEqual(structured.sector_tags, valid.sector_tags);
});

test("parser fails after max retries on persistent malformed JSON", async () => {
  const llmCaller = makeMockLlm(["{bad", "{also bad", "{still bad"]);
  await assert.rejects(() =>
    parseNaturalLanguageQuery("test query", { llmCaller })
  );
});

test("parser fails on validation error without silent pass-through", async () => {
  const invalid = { ...fixtures[0].llm_output, funding_stage: ["invalid_stage"] };
  const llmCaller = makeMockLlm([invalid, invalid, invalid]);
  await assert.rejects(() =>
    parseNaturalLanguageQuery(fixtures[0].input, { llmCaller })
  );
});
