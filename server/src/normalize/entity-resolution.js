import { normalizeCompanyDomain, hostFromUrl } from "../heavy_agent/domain-blocklist.js";

const NAME_SUFFIX_RE =
  /\b(inc|incorporated|llc|ltd|limited|corp|corporation|company|co|gmbh|plc)\b/gi;

export const FUZZY_NAME_THRESHOLD = 0.85;

export function normalizeName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .replace(NAME_SUFFIX_RE, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;

  const tokensA = new Set(na.split(" ").filter(Boolean));
  const tokensB = new Set(nb.split(" ").filter(Boolean));
  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

export function normalizeDomain(domain) {
  return normalizeCompanyDomain(domain);
}

export function extractDomain(record) {
  const fromField = normalizeDomain(record.domain);
  if (fromField) return fromField;

  const website = record.raw?.website ?? record.website;
  if (website) {
    try {
      const host = hostFromUrl(website.startsWith("http") ? website : `https://${website}`);
      return normalizeCompanyDomain(host);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Group raw source records into entity clusters.
 * Primary key: domain. Fallback: fuzzy name match.
 */
export function resolveEntities(records) {
  const enriched = records.map((record) => ({
    record,
    domain: extractDomain(record),
    normalizedName: normalizeName(record.name),
  }));

  const groups = [];
  const domainIndex = new Map();

  for (const item of enriched) {
    if (item.domain) {
      const existing = domainIndex.get(item.domain);
      if (existing) {
        existing.items.push(item);
        continue;
      }
      const group = { key: item.domain, domain: item.domain, items: [item] };
      domainIndex.set(item.domain, group);
      groups.push(group);
      continue;
    }

    let matched = null;
    let bestScore = 0;

    for (const group of groups) {
      for (const member of group.items) {
        const score = nameSimilarity(item.record.name, member.record.name);
        if (score >= FUZZY_NAME_THRESHOLD && score > bestScore) {
          bestScore = score;
          matched = group;
        }
      }
    }

    if (matched) {
      matched.items.push(item);
      if (!matched.domain && item.domain) {
        matched.domain = item.domain;
        matched.key = item.domain;
        domainIndex.set(item.domain, matched);
      }
      continue;
    }

    const orphanKey = `name:${item.normalizedName || item.record.name}`;
    const group = { key: orphanKey, domain: null, items: [item] };
    groups.push(group);
  }

  // Merge orphan name-groups that fuzzy-match each other
  const merged = [];
  const used = new Set();

  for (let i = 0; i < groups.length; i++) {
    if (used.has(i)) continue;
    const group = { ...groups[i], items: [...groups[i].items] };
    used.add(i);

    for (let j = i + 1; j < groups.length; j++) {
      if (used.has(j)) continue;
      const other = groups[j];
      if (group.domain || other.domain) continue;

      const score = nameSimilarity(
        group.items[0].record.name,
        other.items[0].record.name
      );
      if (score >= FUZZY_NAME_THRESHOLD) {
        group.items.push(...other.items);
        used.add(j);
      }
    }

    if (!group.domain) {
      for (const item of group.items) {
        const d = extractDomain(item.record);
        if (d) {
          const existing = domainIndex.get(d);
          if (existing && existing !== group) {
            existing.items.push(...group.items);
            group._absorbed = true;
            break;
          }
          group.domain = d;
          group.key = d;
          domainIndex.set(d, group);
          break;
        }
      }
    }

    if (!group._absorbed) {
      merged.push(group);
    }
  }

  return merged.filter((g) => g.items.length > 0);
}
