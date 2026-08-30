import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPlausibilityToOutcomes } from "../../../src/heavy_agent/entity-plausibility.js";
import { PRIMARY_PLAUSIBILITY_THRESHOLD } from "../../../src/ranking/plausibility.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "../../fixtures/heavy_agent/known_bad_entities");

async function loadFixtures() {
  const files = (await readdir(FIXTURES_DIR)).filter((f) => f.endsWith(".json"));
  const fixtures = [];
  for (const file of files.sort()) {
    const raw = await readFile(path.join(FIXTURES_DIR, file), "utf8");
    fixtures.push({ file, fixture: JSON.parse(raw) });
  }
  return fixtures;
}

const fixtures = await loadFixtures();

for (const { file, fixture } of fixtures) {
  test(`known-bad plausibility: ${fixture.id} (${file})`, () => {
    const outcome = {
      source: fixture.record.source ?? "openai_search",
      success: true,
      results: [{ ...fixture.record }],
    };

    applyPlausibilityToOutcomes([outcome]);
    const record = outcome.results[0];
    const { expected } = fixture;

    if (expected.entityPlausibilityBelowPrimary) {
      assert.ok(
        record.entity_plausibility < PRIMARY_PLAUSIBILITY_THRESHOLD,
        `${fixture.id}: plausibility ${record.entity_plausibility} should be < ${PRIMARY_PLAUSIBILITY_THRESHOLD}`
      );
    } else if (expected.entityPlausibilityBelowPrimary === false) {
      assert.ok(
        record.entity_plausibility >= PRIMARY_PLAUSIBILITY_THRESHOLD,
        `${fixture.id}: plausibility should be >= primary threshold`
      );
    }
  });
}
