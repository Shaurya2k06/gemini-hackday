import { test } from "node:test";
import assert from "node:assert/strict";
import {
  passesCountryHardGate,
  applyCountryHardGate,
  resolveGeoParams,
} from "../../../src/heavy_agent/geo.js";

test("resolveGeoParams maps Spain to ES / europe", () => {
  const params = resolveGeoParams({
    geography: ["Spain"],
    country_code: "ES",
    region: "europe",
  });
  assert.equal(params.country_code, "ES");
  assert.equal(params.gl, "es");
  assert.equal(params.region, "europe");
});

test("passesCountryHardGate rejects .ie domain for ES mandate", () => {
  const gate = passesCountryHardGate(
    { name: "AgTech Ireland", domain: "agtechireland.ie", geography: "Ireland" },
    { country_code: "ES", geography: ["Spain"] }
  );
  assert.equal(gate.ok, false);
  assert.match(gate.reason, /domain_tld_conflicts_ES|geography_conflicts_ES/);
});

test("passesCountryHardGate rejects India geography for ES mandate", () => {
  const gate = passesCountryHardGate(
    { name: "KhetiBuddy", domain: "khetibuddy.com", geography: "India" },
    { country_code: "ES" }
  );
  assert.equal(gate.ok, false);
  assert.equal(gate.reason, "geography_conflicts_ES");
});

test("passesCountryHardGate keeps Spanish company for ES mandate", () => {
  const gate = passesCountryHardGate(
    { name: "Spherag", domain: "spherag.com", geography: "Zaragoza, Spain" },
    { country_code: "ES", geography: ["Spain"] }
  );
  assert.equal(gate.ok, true);
});

test("applyCountryHardGate drops Ireland from Spain agritech shortlist", () => {
  const companies = [
    { name: "AgTech Ireland", domain: "agtechireland.ie", geography: "Ireland" },
    { name: "Agroptima", domain: "agroptima.com", geography: "Barcelona, Spain" },
    { name: "FieldPad", domain: "fieldpad.es", geography: "Elche, Spain" },
    { name: "KhetiBuddy", domain: "khetibuddy.com", geography: "Pune, India" },
  ];
  const { kept, dropped } = applyCountryHardGate(companies, {
    country_code: "ES",
    geography: ["Spain"],
  });
  assert.equal(kept.length, 2);
  assert.ok(kept.every((c) => /spain|es$/i.test(`${c.geography} ${c.domain}`)));
  assert.equal(dropped.length, 2);
  assert.ok(dropped.some((d) => d.company.domain === "agtechireland.ie"));
});

test("passesCountryHardGate is no-op without country_code", () => {
  const gate = passesCountryHardGate(
    { name: "Anywhere", domain: "agtechireland.ie", geography: "Ireland" },
    { geography: ["Europe"] }
  );
  assert.equal(gate.ok, true);
});
