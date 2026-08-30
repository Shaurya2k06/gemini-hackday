import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveGeoParams,
  isIndiaGeography,
  locationMatchesGeography,
  passesCountryHardGate,
  applyCountryHardGate,
} from "../../../src/heavy_agent/geo.js";

test("country_code IN resolves to India Serper geo params without city map", () => {
  const params = resolveGeoParams({
    geography: ["Jaipur", "Rajasthan", "India"],
    country_code: "IN",
    region: "india",
  });
  assert.equal(params.gl, "in");
  assert.equal(params.region, "india");
  assert.ok(params.location.includes("Jaipur"));
});

test("isIndiaGeography uses region and country_code", () => {
  assert.equal(isIndiaGeography({ country_code: "IN", region: "india", geography: [] }), true);
  assert.equal(
    isIndiaGeography({
      geography: ["Hyderabad", "Telangana", "India"],
      country_code: "IN",
      region: "india",
    }),
    true
  );
  assert.equal(
    isIndiaGeography({ geography: ["Singapore"], country_code: "SG", region: "apac" }),
    false
  );
});

test("unmapped city still works via country_code alone", () => {
  assert.equal(
    isIndiaGeography({ geography: ["Kochi"], country_code: "IN", region: "india" }),
    true
  );
  const params = resolveGeoParams({
    geography: ["Kochi", "Kerala", "India"],
    country_code: "IN",
  });
  assert.equal(params.gl, "in");
});

test("locationMatchesGeography uses token overlap only", () => {
  const structured = {
    geography: ["Hyderabad", "Telangana", "India"],
    country_code: "IN",
    region: "india",
  };
  assert.equal(locationMatchesGeography("Hyderabad, Telangana", structured), true);
  assert.equal(locationMatchesGeography("Telangana, India", structured), true);
  assert.equal(locationMatchesGeography("Berlin, Germany", structured), false);
});

test("geography country name fallback when country_code missing", () => {
  const params = resolveGeoParams({ geography: ["India"] });
  assert.equal(params.gl, "in");
  assert.equal(params.region, "india");
});

test("country_code CO resolves via ISO without city alias map", () => {
  const params = resolveGeoParams({
    geography: ["Bogotá", "Colombia"],
    country_code: "CO",
    region: "latam",
  });
  assert.equal(params.gl, "co");
  assert.equal(params.region, "latam");
});

test("passesCountryHardGate rejects Dublin HQ for Colombia mandate", () => {
  const structured = {
    country_code: "CO",
    geography: ["Bogotá", "Colombia"],
    region: "latam",
  };
  const colombian = { domain: "yuno.co", geography: "Bogotá, Colombia" };
  const irish = { domain: "example.ie", geography: "Dublin, Ireland" };

  assert.equal(passesCountryHardGate(colombian, structured).ok, true);
  assert.equal(passesCountryHardGate(irish, structured).ok, false);
});

test("applyCountryHardGate keeps Spanish companies for Spain mandate", () => {
  const structured = { country_code: "ES", geography: ["Spain"] };
  const companies = [
    { domain: "spherag.com", geography: "Zaragoza, Spain" },
    { domain: "agtechireland.ie", geography: "Dublin, Ireland" },
  ];
  const { kept, dropped } = applyCountryHardGate(companies, structured);
  assert.ok(kept.some((c) => c.domain === "spherag.com"));
  assert.ok(dropped.some((d) => d.company.domain === "agtechireland.ie"));
});
