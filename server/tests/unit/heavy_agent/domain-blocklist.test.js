import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isBlockedCompanyDomain,
  normalizeCompanyDomain,
} from "../../../src/heavy_agent/domain-blocklist.js";
import { normalizeDomain } from "../../../src/normalize/entity-resolution.js";

const BLOCKED = [
  "de.linkedin.com",
  "www.linkedin.com",
  "linkedin.com",
  "crunchbase.com",
  "www.crunchbase.com",
  "api.crunchbase.com",
  "wellfound.com",
  "github.com",
  "api.github.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "fonts.googleapis.com",
  "googletagmanager.com",
  "google.com",
  "gstatic.com",
  "startupindia.gov.in",
  "www.startupindia.gov.in",
  "investindia.gov.in",
  "dipp.nic.in",
  "en.wikipedia.org",
  "static.licdn.com",
  "licdn.com",
  "lnkd.in",
];

const ALLOWED = [
  "stripe.com",
  "razorpay.com",
  "n26.com",
  "paystack.com",
  "klarna.com",
];

test("blocklist rejects aggregator, social, CDN, and Startup India domains", () => {
  for (const host of BLOCKED) {
    assert.equal(isBlockedCompanyDomain(host), true, `expected blocked: ${host}`);
    assert.equal(normalizeCompanyDomain(host), null, `normalize must reject: ${host}`);
    assert.equal(normalizeDomain(host), null, `entity normalize must reject: ${host}`);
  }
});

test("blocklist allows real company domains", () => {
  for (const host of ALLOWED) {
    assert.equal(isBlockedCompanyDomain(host), false, `expected allowed: ${host}`);
    assert.equal(normalizeCompanyDomain(host), host);
  }
});

test("Berlin regression: de.linkedin.com must never persist", () => {
  assert.equal(normalizeCompanyDomain("de.linkedin.com"), null);
  assert.equal(normalizeDomain("de.linkedin.com"), null);
});
