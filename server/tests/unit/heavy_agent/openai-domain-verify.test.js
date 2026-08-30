import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hostnameMatchesCompanyName,
  verifyOpenAIDiscoveryResults,
} from "../../../src/heavy_agent/openai-domain-verify.js";

test("hostnameMatchesCompanyName accepts spherag.com for Spherag", () => {
  assert.equal(hostnameMatchesCompanyName("Spherag", "spherag.com"), true);
});

test("hostnameMatchesCompanyName rejects unrelated domain", () => {
  assert.equal(hostnameMatchesCompanyName("Dock", "antank.net"), false);
});

test("verifyOpenAIDiscoveryResults annotates domain_verified", () => {
  const [good, bad] = verifyOpenAIDiscoveryResults([
    { name: "Groots", domain: "groots.eco" },
    { name: "Dock", domain: "antank.net" },
  ]);
  assert.equal(good.domain_verified, true);
  assert.equal(bad.domain_verified, false);
});
