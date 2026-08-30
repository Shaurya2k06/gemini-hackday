/** Domains that must never be persisted as a company's `domain` field. */

export const BLOCKED_EXACT_HOSTS = new Set([
  "github.com",
  "linkedin.com",
  "wellfound.com",
  "crunchbase.com",
  "startupindia.gov.in",
  "investindia.gov.in",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "fonts.googleapis.com",
  "googletagmanager.com",
  "google.com",
  "gstatic.com",
  "cloudflare.com",
  "schema.org",
  "w3.org",
  "lnkd.in",
  "licdn.com",
  "static.licdn.com",
  "en.wikipedia.org",
  "wikipedia.org",
  "amazon.com",
  "play.google.com",
  "mas.gov.sg",
  "fsa.go.jp",
  "bing.com",
  "linktr.ee",
  "audible.com",
]);

export const BLOCKED_HOST_SUFFIXES = [
  ".linkedin.com",
  ".crunchbase.com",
  ".wellfound.com",
  ".github.com",
  ".wikipedia.org",
  ".licdn.com",
  ".gov.in",
  ".gov.sg",
  ".go.jp",
];

export const BLOCKED_HOST_FRAGMENTS = [
  "googleapis",
  "googletagmanager",
  "gstatic",
  "cloudflare",
  "facebook",
  "twitter",
  "instagram",
  "youtube",
  "linkedin",
  "schema.org",
];

export function hostFromUrl(url) {
  if (!url) return null;
  try {
    const withProto = url.startsWith("http") ? url : `https://${url}`;
    return new URL(withProto).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function isBlockedCompanyDomain(domainOrHost) {
  if (!domainOrHost) return true;
  const h = String(domainOrHost).toLowerCase().replace(/^www\./, "").trim();
  if (!h) return true;
  if (BLOCKED_EXACT_HOSTS.has(h)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => h.endsWith(suffix))) return true;
  if (BLOCKED_HOST_FRAGMENTS.some((frag) => h.includes(frag))) return true;
  if (h.endsWith(".nic.in")) return true;
  return false;
}

export function normalizeCompanyDomain(domainOrHost) {
  if (!domainOrHost || typeof domainOrHost !== "string") return null;
  let d = domainOrHost.toLowerCase().trim();
  if (d.startsWith("www.")) d = d.slice(4);
  if (!d || isBlockedCompanyDomain(d)) return null;
  return d;
}
