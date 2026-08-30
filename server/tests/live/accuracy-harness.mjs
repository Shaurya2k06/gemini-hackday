/**
 * Live accuracy harness for the Zoron discovery pipeline.
 *
 * Drives the real API (parse -> discover) with 10 diverse mandates, then scores
 * each returned company against the stated geography and funding-stage
 * criteria. Sector fit is reported as a soft signal only, since it is a
 * judgement call rather than a strict field match.
 */

const API = "http://localhost:3001";
const CONCURRENCY = 3;

// Country/region tokens the pipeline emits in `geography` (e.g. "Sydney, New
// South Wales, Australia"). Matching is substring-based on lowercased text.
const EUROPE = [
  "united kingdom", "england", "scotland", "wales", "ireland", "france",
  "germany", "spain", "italy", "netherlands", "belgium", "austria",
  "switzerland", "sweden", "denmark", "norway", "finland", "iceland",
  "poland", "portugal", "czech", "slovakia", "slovenia", "croatia",
  "hungary", "romania", "bulgaria", "greece", "estonia", "latvia",
  "lithuania", "luxembourg", "malta", "cyprus", "serbia", "ukraine",
];

const TESTS = [
  {
    id: "T01",
    query: "Series B agritech companies in Australia",
    geo: ["australia"],
    stages: ["series_b"],
  },
  {
    id: "T02",
    query: "European B2B SaaS companies with 10 to 50 million USD revenue that are founder-owned",
    geo: EUROPE,
    stages: null,
  },
  {
    id: "T03",
    query: "Seed stage fintech startups in Berlin",
    geo: ["germany", "berlin"],
    stages: ["seed"],
  },
  {
    id: "T04",
    query: "Series A healthtech companies in India",
    geo: ["india"],
    stages: ["series_a"],
  },
  {
    id: "T05",
    query: "Series C or later AI infrastructure companies in the United States",
    geo: ["united states"],
    stages: ["series_c_plus"],
  },
  {
    id: "T06",
    query: "Developer tools companies in the United Kingdom",
    geo: ["united kingdom", "england", "scotland", "wales", "london"],
    stages: null,
  },
  {
    id: "T07",
    query: "Series B logistics software companies in Singapore",
    geo: ["singapore"],
    stages: ["series_b"],
  },
  {
    id: "T08",
    query: "Series B or later cybersecurity companies in Israel",
    geo: ["israel"],
    stages: ["series_b", "series_c_plus"],
  },
  {
    id: "T09",
    query: "Series A climate tech startups in Sweden",
    geo: ["sweden"],
    stages: ["series_a"],
  },
  {
    id: "T10",
    query: "Manufacturing software companies in Mexico with 10 to 40 million USD revenue",
    geo: ["mexico"],
    stages: null,
  },
];

async function postJson(path, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** Pull the terminal `result` (or `error`) frame out of an SSE stream. */
function readSse(raw) {
  let result = null;
  let error = null;
  const steps = [];
  for (const block of raw.split("\n\n")) {
    const ev = block.match(/^event: (\w+)/m);
    const dt = block.match(/^data: (.*)$/m);
    if (!ev || !dt) continue;
    try {
      const parsed = JSON.parse(dt[1]);
      if (ev[1] === "progress") steps.push(parsed.step ?? "");
      else if (ev[1] === "result") result = parsed;
      else if (ev[1] === "error") error = parsed.error ?? "unknown error";
    } catch {
      // ignore unparsable frame
    }
  }
  return { result, error, steps };
}

function geoHit(cardGeo, tokens) {
  const text = String(cardGeo ?? "").toLowerCase();
  if (!text) return false;
  return tokens.some((t) => text.includes(t));
}

async function runTest(test) {
  const started = Date.now();
  const row = {
    id: test.id,
    query: test.query,
    intent: null,
    count: 0,
    gated: 0,
    geoOk: 0,
    stageOk: 0,
    stageKnown: 0,
    searchError: null,
    jsonError: false,
    companies: [],
    seconds: 0,
  };

  // Stage 1 — natural language to structured mandate.
  const parseRes = await postJson("/api/mandate/parse", { text: test.query }, 90_000);
  if (!parseRes.ok) {
    row.searchError = `parse HTTP ${parseRes.status}`;
    row.seconds = Math.round((Date.now() - started) / 1000);
    return row;
  }
  const parsed = JSON.parse(parseRes.text);
  row.intent = parsed.intent;
  if (!parsed.structured) {
    row.searchError = "parse returned no structured mandate";
    row.seconds = Math.round((Date.now() - started) / 1000);
    return row;
  }

  // Stage 2 — live discovery with the pipeline's default (heavy) gating.
  const discRes = await postJson(
    "/api/discover/stream",
    { structured: parsed.structured, rawQuery: test.query },
    300_000
  );
  const { result, error } = readSse(discRes.text);

  if (error) {
    row.searchError = error;
    row.jsonError = /Invalid JSON in model response/i.test(error);
  }

  if (result) {
    const cards = result.cards ?? [];
    row.count = cards.length;
    row.gated = (result.other_cards ?? []).length;
    if (result.message && /search failed|Invalid JSON/i.test(result.message)) {
      row.searchError = result.message;
      row.jsonError = row.jsonError || /Invalid JSON in model response/i.test(result.message);
    }
    for (const card of cards) {
      const f = card.fields ?? {};
      const geoOk = geoHit(f.geography, test.geo);
      let stageOk = null;
      if (test.stages) {
        if (f.funding_stage && f.funding_stage !== "unknown") {
          row.stageKnown += 1;
          stageOk = test.stages.includes(f.funding_stage);
          if (stageOk) row.stageOk += 1;
        }
      }
      if (geoOk) row.geoOk += 1;
      row.companies.push({
        name: f.name,
        domain: f.domain,
        geography: f.geography,
        stage: f.funding_stage,
        revenue: f.annual_revenue_usd,
        geoOk,
        stageOk,
      });
    }
  } else if (!row.searchError) {
    row.searchError = "no result frame";
  }

  row.seconds = Math.round((Date.now() - started) / 1000);
  return row;
}

async function main() {
  const queue = [...TESTS];
  const rows = [];

  async function worker() {
    while (queue.length) {
      const test = queue.shift();
      process.stderr.write(`start ${test.id}\n`);
      try {
        rows.push(await runTest(test));
      } catch (err) {
        rows.push({
          id: test.id,
          query: test.query,
          count: 0,
          searchError: err.message,
          companies: [],
          geoOk: 0,
          stageOk: 0,
          stageKnown: 0,
          seconds: 0,
        });
      }
      process.stderr.write(`done ${test.id}\n`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  rows.sort((a, b) => a.id.localeCompare(b.id));
  process.stdout.write(JSON.stringify(rows, null, 2));
}

main().catch((err) => {
  console.error("harness failed:", err);
  process.exit(1);
});
