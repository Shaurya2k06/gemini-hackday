/**
 * Compact text renderings of Meredian payloads.
 *
 * Tool results carry a readable digest; the full JSON stays behind a
 * `meredian://` resource URI so the host can fetch it only when needed.
 */

const MAX_SUMMARY_CHARS = 160;

export function cardField(card, key) {
  return card?.fields?.[key] ?? card?.[key] ?? null;
}

function truncate(text, limit = MAX_SUMMARY_CHARS) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
}

/** One line per company: rank, name, domain, geography, revenue, fit. */
export function summarizeCard(card) {
  const name = cardField(card, "name") ?? "(unnamed)";
  const domain = cardField(card, "domain") ?? "—";
  const bits = [];

  const geo = cardField(card, "geography");
  if (geo) bits.push(Array.isArray(geo) ? geo.join("/") : String(geo));

  const revenue = formatMoney(cardField(card, "annual_revenue_usd"));
  if (revenue) bits.push(`rev ${revenue}`);

  const ebitda = formatMoney(cardField(card, "annual_ebitda_usd"));
  if (ebitda) bits.push(`ebitda ${ebitda}`);

  const employees = cardField(card, "employees_count");
  if (employees) bits.push(`${employees} emp`);

  if (card?.pe_fit_score != null) bits.push(`fit ${card.pe_fit_score}`);

  const meta = bits.length ? `  [${bits.join(", ")}]` : "";
  const rank = card?.rank != null ? `${String(card.rank).padStart(2, " ")}. ` : "  - ";
  const summary = truncate(card?.investment_summary ?? cardField(card, "description"));

  return `${rank}${name} (${domain})${meta}${summary ? `\n      ${summary}` : ""}`;
}

export function summarizeShortlist(entry, { includeGated = true } = {}) {
  const lines = [];
  lines.push(`Shortlist ${entry.id} — ${entry.cards.length} companies`);

  const facts = [];
  if (entry.dataSource) facts.push(`source: ${entry.dataSource}`);
  if (entry.heavySearchRan != null) {
    facts.push(`heavy search: ${entry.heavySearchRan ? "yes" : "no"}`);
  }
  if (entry.customColumns?.length) facts.push(`custom columns: ${entry.customColumns.join(", ")}`);
  if (facts.length) lines.push(`  (${facts.join(" · ")})`);

  if (entry.message) lines.push(`  ${entry.message}`);
  lines.push("");

  if (!entry.cards.length) {
    lines.push("  No matching companies.");
  } else {
    for (const card of entry.cards) lines.push(summarizeCard(card));
  }

  if (includeGated && entry.otherCards?.length) {
    lines.push("");
    lines.push(
      `Gated (${entry.otherCards.length}) — incumbents, associations, or entities that failed PE diligence checks:`
    );
    for (const card of entry.otherCards) {
      const name = cardField(card, "name") ?? "(unnamed)";
      const reason = card.gate_reason ?? card.gate_reasons?.[0] ?? "gated";
      lines.push(`  - ${name} (${cardField(card, "domain") ?? "—"}) — ${reason}`);
    }
  }

  lines.push("");
  lines.push(`Full payload: meredian://shortlist/${entry.id}`);
  return lines.join("\n");
}

export function summarizeMandate(entry) {
  const s = entry.structured ?? {};
  const lines = [`Mandate ${entry.id} — intent: ${entry.intent ?? s.intent ?? "unknown"}`];

  if (entry.pills?.length) {
    lines.push("");
    lines.push("Criteria:");
    for (const pill of entry.pills) {
      // Pills are { id, category, label, field, value, removable } —
      // `category` is the human group ("Geography"), `label` the display value.
      const category = pill?.category ?? pill?.field ?? "criterion";
      const value = pill?.label ?? pill?.value ?? "";
      lines.push(`  · ${category}${value ? `: ${value}` : ""}`);
    }
  }

  if (entry.accumulatedText) {
    lines.push("");
    lines.push(`Accumulated query: ${entry.accumulatedText}`);
  }

  lines.push("");
  lines.push(`Full payload: meredian://mandate/${entry.id}`);
  return lines.join("\n");
}

export function summarizeDossier(entry) {
  const card = entry.dossier ?? {};
  const name = cardField(card, "name") ?? entry.domain;
  const lines = [`Dossier — ${name} (${entry.domain})`];

  if (entry.enrichmentSuccess === false) {
    lines.push("  (enrichment did not complete; showing what is known)");
  }

  const detail = [
    ["Description", cardField(card, "description")],
    ["Geography", cardField(card, "geography")],
    ["Sectors", cardField(card, "sector_tags")],
    ["Founded", cardField(card, "founded_date")],
    ["Employees", cardField(card, "employees_count")],
    ["Revenue", formatMoney(cardField(card, "annual_revenue_usd"))],
    ["EBITDA", formatMoney(cardField(card, "annual_ebitda_usd"))],
    ["Funding stage", cardField(card, "funding_stage")],
    ["Total raised", formatMoney(cardField(card, "total_raised"))],
    ["Investors", cardField(card, "investors")],
    ["Leadership", cardField(card, "leadership")],
    ["Ownership signals", cardField(card, "ownership_signals")],
    ["Positioning", cardField(card, "competitive_positioning")],
    ["Contact", cardField(card, "contact_email") ?? cardField(card, "contact_phone")],
  ];

  lines.push("");
  for (const [label, value] of detail) {
    const rendered = renderValue(value);
    if (rendered) lines.push(`  ${label}: ${rendered}`);
  }

  if (card.investment_summary) {
    lines.push("");
    lines.push(`Investment view: ${card.investment_summary}`);
  }

  if (card.links?.length) {
    lines.push("");
    lines.push("Sources:");
    for (const link of card.links.slice(0, 10)) {
      lines.push(`  - ${link.label}: ${link.url}`);
    }
  }

  lines.push("");
  lines.push(`Full payload: meredian://dossier/${entry.domain}`);
  return lines.join("\n");
}

function renderValue(value) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) {
    const items = value
      .map((v) =>
        typeof v === "object" && v !== null ? v.name ?? v.title ?? JSON.stringify(v) : String(v)
      )
      .filter(Boolean);
    return items.length ? items.join(", ") : null;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
