import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ResultStore } from "../src/store.js";
import { connectTestClient } from "./helpers/test-client.js";
import { makeShortlistInput } from "./helpers/fixtures.js";
import * as realPipeline from "../src/pipeline.js";

/**
 * Export tests run against the real export code rather than stubs — the point
 * is to prove the bytes on disk are valid CSV/PDF.
 */
async function tmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "meredian-export-test-"));
}

function withCustomColumn(input, label, values) {
  return {
    ...input,
    cards: input.cards.map((card, i) => ({
      ...card,
      custom_columns: { [label]: values[i] ?? null },
    })),
  };
}

test("meredian_export_shortlist writes valid CSV to an explicit path", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(3));
  const dir = await tmpDir();
  const target = path.join(dir, "out.csv");
  const { client, close } = await connectTestClient({}, { store, pipeline: realPipeline });
  try {
    const result = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId, format: "csv", outputPath: target },
    });

    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.path, target);
    assert.equal(result.structuredContent.companyCount, 3);
    assert.ok(result.structuredContent.bytes > 0);

    const csv = await fs.readFile(target, "utf8");
    assert.ok(realPipeline.isValidCsv(csv), "written bytes must be valid CSV");
    assert.match(csv.split("\n")[0], /^rank,name,domain/);
    assert.match(csv, /Company 1/);
    assert.match(csv, /co3\.example/);
  } finally {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("meredian_export_shortlist writes valid PDF bytes", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(2));
  const dir = await tmpDir();
  const target = path.join(dir, "out.pdf");
  const { client, close } = await connectTestClient({}, { store, pipeline: realPipeline });
  try {
    const result = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId, format: "pdf", outputPath: target },
    });

    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.format, "pdf");

    const bytes = await fs.readFile(target);
    assert.ok(
      realPipeline.isValidPdf(bytes.toString("binary")),
      "written bytes must be a valid PDF"
    );
    assert.equal(bytes.subarray(0, 4).toString(), "%PDF");
  } finally {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("CSV export includes researched custom columns", async () => {
  const store = new ResultStore();
  const input = withCustomColumn(makeShortlistInput(3), "CEO", ["Jane Doe", null, "Sam Patel"]);
  const shortlistId = store.putShortlist(input);
  store.replaceShortlistCards(shortlistId, input.cards, { columnLabel: "CEO" });

  const dir = await tmpDir();
  const target = path.join(dir, "custom.csv");
  const { client, close } = await connectTestClient({}, { store, pipeline: realPipeline });
  try {
    const result = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId, outputPath: target },
    });

    assert.deepEqual(result.structuredContent.customColumns, ["CEO"]);
    const csv = await fs.readFile(target, "utf8");
    const [header, ...rows] = csv.trim().split("\n");

    assert.ok(header.endsWith(",CEO"), `custom column missing from header: ${header}`);
    assert.ok(rows[0].endsWith(",Jane Doe"), rows[0]);
    assert.ok(rows[1].endsWith(","), "null value should render as an empty cell");
    assert.ok(rows[2].endsWith(",Sam Patel"), rows[2]);
    assert.ok(realPipeline.isValidCsv(csv));
  } finally {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("omitting custom columns preserves the original CSV shape", () => {
  // Backwards compatibility: existing callers pass no options.
  const rows = realPipeline.normalizeExportCompanies(makeShortlistInput(2).cards);
  const csv = realPipeline.generateCsv(rows);
  const header = csv.split("\n")[0];
  assert.equal(header.split(",").length, 19, "must remain the original 19 columns");
  assert.ok(realPipeline.isValidCsv(csv));
});

test("export defaults to a timestamped file in the temp directory", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(1));
  const { client, close } = await connectTestClient({}, { store, pipeline: realPipeline });
  let written;
  try {
    const result = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId },
    });
    written = result.structuredContent.path;

    assert.equal(result.structuredContent.format, "csv", "csv is the default format");
    assert.ok(written.startsWith(os.tmpdir()), `expected a temp path, got ${written}`);
    assert.match(written, /meredian-shortlist-\d+\.csv$/);
    await fs.access(written);
  } finally {
    await close();
    if (written) await fs.rm(written, { force: true });
  }
});

test("includeGated adds gated matches to the export", async () => {
  const store = new ResultStore();
  const input = makeShortlistInput(2);
  const shortlistId = store.putShortlist({
    ...input,
    otherCards: [
      {
        ...input.cards[0],
        rank: 3,
        gate_reason: "listed incumbent",
        fields: { ...input.cards[0].fields, name: "Gated Co", domain: "gated.example" },
      },
    ],
  });
  const dir = await tmpDir();
  const target = path.join(dir, "gated.csv");
  const { client, close } = await connectTestClient({}, { store, pipeline: realPipeline });
  try {
    const withoutGated = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId, outputPath: target },
    });
    assert.equal(withoutGated.structuredContent.companyCount, 2);
    assert.doesNotMatch(await fs.readFile(target, "utf8"), /Gated Co/);

    const withGated = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId, outputPath: target, includeGated: true },
    });
    assert.equal(withGated.structuredContent.companyCount, 3);
    assert.match(await fs.readFile(target, "utf8"), /Gated Co/);
  } finally {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("relative paths escaping the export directory are refused", async () => {
  const store = new ResultStore();
  const shortlistId = store.putShortlist(makeShortlistInput(1));
  const { client, close } = await connectTestClient({}, { store, pipeline: realPipeline });
  try {
    const result = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId, outputPath: "../../../../etc/meredian-escape.csv" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /escapes the export directory/);
  } finally {
    await close();
  }
});

test("export rejects unknown and empty shortlists", async () => {
  const store = new ResultStore();
  const emptyId = store.putShortlist({ ...makeShortlistInput(0), cards: [] });
  const { client, close } = await connectTestClient({}, { store, pipeline: realPipeline });
  try {
    const unknown = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId: "s99" },
    });
    assert.equal(unknown.isError, true);
    assert.match(unknown.content[0].text, /No shortlist found with id "s99"/);

    const empty = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId: emptyId },
    });
    assert.equal(empty.isError, true);
    assert.match(empty.content[0].text, /no companies to export/);
  } finally {
    await close();
  }
});

test("PDF export notes that custom columns are CSV-only", async () => {
  const store = new ResultStore();
  const input = withCustomColumn(makeShortlistInput(2), "CEO", ["Jane Doe", "Sam Patel"]);
  const shortlistId = store.putShortlist(input);
  store.replaceShortlistCards(shortlistId, input.cards, { columnLabel: "CEO" });

  const dir = await tmpDir();
  const target = path.join(dir, "note.pdf");
  const { client, close } = await connectTestClient({}, { store, pipeline: realPipeline });
  try {
    const result = await client.callTool({
      name: "meredian_export_shortlist",
      arguments: { shortlistId, format: "pdf", outputPath: target },
    });
    assert.match(result.content[0].text, /custom columns \(CEO\) appear in CSV output only/);
  } finally {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
