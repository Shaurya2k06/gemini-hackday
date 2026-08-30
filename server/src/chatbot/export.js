import { formatCompanyCard } from "./format.js";

const CSV_HEADERS = [
  "rank",
  "name",
  "domain",
  "description",
  "sector_tags",
  "funding_stage",
  "total_raised",
  "last_funding_date",
  "investors",
  "employees_count",
  "founded_date",
  "geography",
  "annual_revenue_usd",
  "annual_ebitda_usd",
  "contact_email",
  "contact_phone",
  "sources_found",
  "investment_summary",
  "enrichment_sources",
];

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * Render ranked results as CSV.
 *
 * @param rankedResults          rows in `{ rank, company }` shape
 * @param options.customColumns  extra researched column labels to append; values
 *                               are read from each row's `custom_columns` map.
 *                               Omitting this preserves the original 19-column output.
 */
export function generateCsv(rankedResults, { customColumns = [] } = {}) {
  const extraColumns = Array.isArray(customColumns) ? customColumns.filter(Boolean) : [];
  const lines = [[...CSV_HEADERS, ...extraColumns].join(",")];

  for (const row of rankedResults) {
    const card = formatCompanyCard(row);
    const values = [
      card.rank,
      card.fields.name,
      card.fields.domain,
      card.fields.description,
      (card.fields.sector_tags ?? []).join("; "),
      card.fields.funding_stage,
      card.fields.total_raised,
      card.fields.last_funding_date,
      (card.fields.investors ?? []).join("; "),
      card.fields.employees_count,
      card.fields.founded_date,
      card.fields.geography,
      card.fields.annual_revenue_usd,
      card.fields.annual_ebitda_usd,
      card.fields.contact_email,
      card.fields.contact_phone,
      card.sources.join("; "),
      card.investment_summary,
      (card.enrichment_sources ?? []).join("; "),
      // `formatCompanyCard` drops unknown keys, so read researched columns off
      // the original row.
      ...extraColumns.map((label) => row?.custom_columns?.[label] ?? null),
    ];
    lines.push(values.map(csvEscape).join(","));
  }

  return `${lines.join("\n")}\n`;
}

function escapePdfText(text) {
  return String(text).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function fmtUsd(value) {
  if (value == null || value === "") return "n/a";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  if (num >= 1_000_000) return `$${Math.round(num / 100_000) / 10}M`;
  if (num >= 1_000) return `$${Math.round(num / 100) / 10}K`;
  return `$${num}`;
}

function fmtList(items) {
  if (!items?.length) return "n/a";
  return items.join(", ");
}

function wrapText(text, maxLen = 92) {
  const words = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxLen) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += maxLen) {
        lines.push(word.slice(i, i + maxLen));
      }
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxLen && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapUrl(url, maxLen = 86) {
  const s = String(url ?? "");
  if (!s) return [];
  if (s.length <= maxLen) return [s];
  const lines = [];
  for (let i = 0; i < s.length; i += maxLen) {
    lines.push(s.slice(i, i + maxLen));
  }
  return lines;
}

const PAGE = {
  width: 612,
  height: 792,
  marginX: 48,
  topY: 740,
  bottomY: 56,
};

const STYLE = {
  brand: { font: "F2", size: 10, leading: 13 },
  title: { font: "F2", size: 18, leading: 22 },
  meta: { font: "F1", size: 9, leading: 12 },
  company: { font: "F2", size: 13, leading: 18 },
  section: { font: "F2", size: 10, leading: 14 },
  label: { font: "F2", size: 9, leading: 12 },
  body: { font: "F1", size: 9, leading: 12 },
  muted: { font: "F1", size: 8, leading: 11 },
  footer: { font: "F1", size: 8, leading: 10 },
};

function blockHeight(block) {
  if (block.type === "spacer") return block.height ?? 8;
  if (block.type === "rule") return block.height ?? 12;
  if (block.type === "kv" || block.type === "kvPair") {
    return STYLE.body.leading;
  }
  const style = STYLE[block.style] ?? STYLE.body;
  return style.leading;
}

function pushSpacer(blocks, height = 8) {
  blocks.push({ type: "spacer", height });
}

function pushRule(blocks) {
  blocks.push({ type: "rule", height: 14 });
}

function pushSection(blocks, title) {
  pushSpacer(blocks, 10);
  blocks.push({ type: "text", style: "section", text: title });
  pushSpacer(blocks, 3);
}

function pushWrapped(blocks, text, style = "body", maxLen = 92) {
  for (const line of wrapText(text, maxLen)) {
    blocks.push({ type: "text", style, text: line });
  }
}

function pushKv(blocks, label, value) {
  const display = value == null || value === "" ? "n/a" : String(value);
  if (display.length <= 72) {
    blocks.push({ type: "kv", label, value: display });
    return;
  }
  blocks.push({ type: "kv", label, value: "" });
  pushWrapped(blocks, display, "body", 90);
}

function pushKvPair(blocks, left, right) {
  blocks.push({
    type: "kvPair",
    leftLabel: left.label,
    leftValue: left.value == null || left.value === "" ? "n/a" : String(left.value),
    rightLabel: right.label,
    rightValue: right.value == null || right.value === "" ? "n/a" : String(right.value),
  });
}

function buildCompanyBlocks(card) {
  const f = card.fields;
  const blocks = [];

  blocks.push({
    type: "text",
    style: "company",
    text: `${card.rank}. ${f.name ?? "Unknown"}`,
  });
  pushSpacer(blocks, 5);

  pushKvPair(
    blocks,
    { label: "Domain", value: f.domain ?? "n/a" },
    { label: "HQ", value: f.geography ?? "n/a" }
  );
  pushKvPair(
    blocks,
    { label: "Stage", value: f.funding_stage ?? "n/a" },
    { label: "Founded", value: f.founded_date ?? "n/a" }
  );
  pushKvPair(
    blocks,
    { label: "Employees", value: f.employees_count ?? "n/a" },
    { label: "Revenue", value: fmtUsd(f.annual_revenue_usd) }
  );
  pushKvPair(
    blocks,
    { label: "EBITDA", value: fmtUsd(f.annual_ebitda_usd) },
    { label: "Raised", value: fmtUsd(f.total_raised) }
  );
  pushKv(blocks, "Last funding", f.last_funding_date ?? "n/a");
  pushKv(blocks, "Investors", fmtList(f.investors));
  pushKv(blocks, "Sector", fmtList(f.sector_tags));

  if (f.contact_email || f.contact_phone) {
    pushKvPair(
      blocks,
      { label: "Email", value: f.contact_email ?? "n/a" },
      { label: "Phone", value: f.contact_phone ?? "n/a" }
    );
  }

  if (card.pe_fit_score != null || card.fit_summary || card.fit_status || card.revenue_ebitda_fit) {
    pushSection(blocks, "Screening fit");
    if (card.pe_fit_score != null) pushKv(blocks, "Fit score", `${card.pe_fit_score}%`);
    if (card.fit_status) pushKv(blocks, "Status", card.fit_status);
    if (card.revenue_ebitda_fit) pushKv(blocks, "Financial band", card.revenue_ebitda_fit);
    if (card.fit_summary) pushWrapped(blocks, card.fit_summary);
  }

  if (f.description) {
    pushSection(blocks, "Description");
    pushWrapped(blocks, f.description);
  }

  if (card.investment_summary) {
    pushSection(blocks, "Investment thesis");
    pushWrapped(blocks, card.investment_summary);
  }

  if (card.gate_reason || card.gate_reasons?.length) {
    pushSection(blocks, "Exclusion");
    pushWrapped(blocks, card.gate_reason || card.gate_reasons.join("; "));
  }

  if (card.sources?.length) {
    pushSection(blocks, "Data sources");
    pushWrapped(blocks, fmtList(card.sources), "muted", 88);
  }

  const links = card.links ?? [];
  if (links.length) {
    pushSection(blocks, "Links");
    for (const link of links) {
      const label = link.label || "Link";
      const url = link.url || "";
      blocks.push({ type: "text", style: "label", text: label });
      for (const line of wrapUrl(url)) {
        blocks.push({ type: "text", style: "muted", text: line });
      }
      pushSpacer(blocks, 3);
    }
  }

  pushRule(blocks);
  pushSpacer(blocks, 8);
  return blocks;
}

function buildReportBlocks(rankedResults) {
  const generatedAt = new Date().toISOString().slice(0, 10);
  const blocks = [];

  blocks.push({ type: "text", style: "brand", text: "MEREDIAN" });
  blocks.push({ type: "text", style: "title", text: "Target Screening Diligence Report" });
  pushSpacer(blocks, 4);
  blocks.push({
    type: "text",
    style: "meta",
    text: `Generated ${generatedAt}  ·  ${rankedResults.length} compan${rankedResults.length === 1 ? "y" : "ies"}`,
  });
  pushRule(blocks);
  pushSpacer(blocks, 6);

  for (const row of rankedResults) {
    const card = formatCompanyCard(row);
    blocks.push(...buildCompanyBlocks(card));
  }

  return blocks;
}

function paginateBlocks(blocks) {
  const usable = PAGE.topY - PAGE.bottomY;
  const pages = [];
  let current = [];
  let used = 0;

  for (const block of blocks) {
    const h = blockHeight(block);
    if (current.length && used + h > usable) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += h;
  }
  if (current.length) pages.push(current);
  return pages.length ? pages : [[{ type: "text", style: "body", text: "" }]];
}

function truncateForCol(text, maxLen) {
  const s = String(text ?? "");
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function renderKvLine(label, value) {
  return [
    `/F2 ${STYLE.label.size} Tf`,
    `(${escapePdfText(`${label}: `)}) Tj`,
    `/F1 ${STYLE.body.size} Tf`,
    `(${escapePdfText(value)}) Tj`,
  ];
}

function buildPageStream(blocks, { pageIndex, pageCount }) {
  const ops = [];
  let y = PAGE.topY;
  let inText = false;

  const endText = () => {
    if (inText) {
      ops.push("ET");
      inText = false;
    }
  };

  const beginTextAt = (x, yPos, styleKey) => {
    const style = STYLE[styleKey] ?? STYLE.body;
    if (!inText) {
      ops.push("BT");
      inText = true;
    }
    ops.push(`/${style.font} ${style.size} Tf`);
    ops.push(`1 0 0 1 ${x} ${yPos} Tm`);
  };

  for (const block of blocks) {
    if (block.type === "spacer") {
      endText();
      y -= block.height ?? 8;
      continue;
    }

    if (block.type === "rule") {
      endText();
      const ruleY = y - 4;
      ops.push("0.72 0.72 0.72 RG");
      ops.push("0.6 w");
      ops.push(`${PAGE.marginX} ${ruleY} m`);
      ops.push(`${PAGE.width - PAGE.marginX} ${ruleY} l`);
      ops.push("S");
      ops.push("0 0 0 RG");
      y -= block.height ?? 14;
      continue;
    }

    if (block.type === "kv") {
      beginTextAt(PAGE.marginX, y, "body");
      ops.push(...renderKvLine(block.label, block.value));
      y -= STYLE.body.leading;
      continue;
    }

    if (block.type === "kvPair") {
      const midX = PAGE.marginX + 268;
      beginTextAt(PAGE.marginX, y, "body");
      ops.push(
        ...renderKvLine(block.leftLabel, truncateForCol(block.leftValue, 28))
      );
      beginTextAt(midX, y, "body");
      ops.push(
        ...renderKvLine(block.rightLabel, truncateForCol(block.rightValue, 28))
      );
      y -= STYLE.body.leading;
      continue;
    }

    const styleKey = block.style ?? "body";
    const style = STYLE[styleKey] ?? STYLE.body;
    beginTextAt(PAGE.marginX, y, styleKey);
    ops.push(`(${escapePdfText(block.text ?? "")}) Tj`);
    y -= style.leading;
  }

  endText();

  // Footer
  ops.push("BT");
  ops.push(`/F1 ${STYLE.footer.size} Tf`);
  ops.push(`1 0 0 1 ${PAGE.marginX} 36 Tm`);
  ops.push(`(${escapePdfText("Meredian diligence export")}) Tj`);
  const pageLabel = `Page ${pageIndex + 1} of ${pageCount}`;
  ops.push(`1 0 0 1 ${PAGE.width - PAGE.marginX - pageLabel.length * 4.2} 36 Tm`);
  ops.push(`(${escapePdfText(pageLabel)}) Tj`);
  ops.push("ET");

  return `${ops.join("\n")}\n`;
}

function assemblePdf(pages) {
  const objects = [];
  const pageObjectIds = [];
  let nextId = 1;

  const catalogId = nextId++;
  const pagesId = nextId++;
  const fontRegularId = nextId++;
  const fontBoldId = nextId++;

  for (let i = 0; i < pages.length; i++) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageObjectIds.push(pageId);

    const stream = buildPageStream(pages[i], {
      pageIndex: i,
      pageCount: pages.length,
    });
    objects.push({
      id: contentId,
      body: `<< /Length ${stream.length} >>stream\n${stream}endstream`,
    });
    objects.push({
      id: pageId,
      body: `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R >> >> >>`,
    });
  }

  objects.push({
    id: pagesId,
    body: `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>`,
  });
  objects.push({
    id: catalogId,
    body: `<< /Type /Catalog /Pages ${pagesId} 0 R >>`,
  });
  objects.push({
    id: fontRegularId,
    body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  });
  objects.push({
    id: fontBoldId,
    body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>`,
  });

  objects.sort((a, b) => a.id - b.id);

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj.id} 0 obj\n${obj.body}\nendobj\n`;
  }

  const xrefStart = pdf.length;
  const maxId = objects[objects.length - 1].id;
  pdf += `xref\n0 ${maxId + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let id = 1; id <= maxId; id++) {
    const offset = offsets[id] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  return pdf;
}

/**
 * Multi-page PDF diligence report with company profiles and mandate-fit detail.
 */
export function generatePdf(rankedResults) {
  const blocks = buildReportBlocks(rankedResults ?? []);
  const pages = paginateBlocks(blocks);
  return assemblePdf(pages);
}

export function isValidCsv(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length < 1) return false;
  const headers = lines[0].split(",");
  return headers.includes("rank") && headers.includes("domain") && headers.includes("name");
}

export function isValidPdf(pdf) {
  return typeof pdf === "string" && pdf.startsWith("%PDF-1.4") && pdf.includes("%%EOF");
}
