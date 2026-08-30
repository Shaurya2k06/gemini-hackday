import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { connectTestClient } from "./helpers/test-client.js";
import { makeStructuredMandate } from "./helpers/fixtures.js";

/** Records the arguments the tool passed through to the pipeline. */
function stubPipeline(overrides = {}) {
  const calls = [];
  return {
    calls,
    pipeline: {
      handleMandateParse: async (args) => {
        calls.push({ fn: "handleMandateParse", args });
        return {
          intent: "mandate_search",
          structured: makeStructuredMandate(),
          pills: [
            { id: "geography-1", category: "Geography", label: "Europe", field: "geography", value: "Europe" },
            { id: "keywords-2", category: "Keywords", label: "b2b saas", field: "keywords", value: "b2b saas" },
          ],
          accumulatedText: args.accumulatedText
            ? `${args.accumulatedText}, ${args.text}`
            : args.text,
        };
      },
      handleThesisPdfParse: async (buffer, meta) => {
        calls.push({ fn: "handleThesisPdfParse", size: buffer.length, meta });
        return {
          intent: "mandate_search",
          structured: makeStructuredMandate({ raw_query: "from thesis" }),
          pills: [],
          accumulatedText: "from thesis",
        };
      },
      ...overrides,
    },
  };
}

test("meredian_parse_mandate stores the mandate and returns a referencable id", async () => {
  const { pipeline, calls } = stubPipeline();
  const { client, store, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "meredian_parse_mandate",
      arguments: { text: "european b2b saas 10-50m revenue" },
    });

    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.mandateId, "m1");
    assert.equal(result.structuredContent.intent, "mandate_search");

    // Criteria are rendered as "Category: value" from the pill shape.
    assert.match(result.content[0].text, /Geography: Europe/);
    assert.match(result.content[0].text, /Keywords: b2b saas/);
    assert.match(result.content[0].text, /meredian:\/\/mandate\/m1/);

    assert.ok(store.getMandate("m1"));
    assert.equal(calls[0].args.text, "european b2b saas 10-50m revenue");
  } finally {
    await close();
  }
});

test("meredian_parse_mandate threads accumulated context back into the pipeline", async () => {
  const { pipeline, calls } = stubPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const prior = makeStructuredMandate();
    await client.callTool({
      name: "meredian_parse_mandate",
      arguments: {
        text: "founder-owned",
        accumulatedText: "european b2b saas",
        priorStructured: prior,
      },
    });

    const { args } = calls[0];
    assert.equal(args.accumulatedText, "european b2b saas");
    assert.deepEqual(args.priorStructured, prior);
    assert.equal(args.fieldHint, null);
  } finally {
    await close();
  }
});

test("meredian_parse_mandate forwards a fieldHint for single-criterion additions", async () => {
  const { pipeline, calls } = stubPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    await client.callTool({
      name: "meredian_parse_mandate",
      arguments: {
        text: "Spain",
        accumulatedText: "b2b saas",
        priorStructured: makeStructuredMandate(),
        fieldHint: "geography",
      },
    });
    assert.equal(calls[0].args.fieldHint, "geography");
  } finally {
    await close();
  }
});

test("meredian_parse_mandate rejects a fieldHint the merge logic cannot handle", async () => {
  const { pipeline, calls } = stubPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    // Only geography/sector_tags/funding_stage/keywords are supported upstream;
    // an unsupported hint must be refused rather than silently no-op'ing.
    let rejected = false;
    let message = "";
    try {
      const result = await client.callTool({
        name: "meredian_parse_mandate",
        arguments: { text: "50", fieldHint: "revenue" },
      });
      rejected = result.isError === true;
      message = result.content?.[0]?.text ?? "";
    } catch (error) {
      rejected = true;
      message = error.message;
    }

    assert.ok(rejected, "unsupported fieldHint must be refused");
    assert.match(message, /fieldHint|revenue|invalid|enum/i);
    assert.equal(calls.length, 0, "pipeline must not be called with a bad hint");
  } finally {
    await close();
  }
});

test("meredian_parse_mandate explains itself when no criteria are extractable", async () => {
  const { pipeline } = stubPipeline({
    handleMandateParse: async () => ({
      intent: "mandate_search",
      structured: null,
      pills: [],
      accumulatedText: "",
    }),
  });
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "meredian_parse_mandate",
      arguments: { text: "" },
    });
    assert.equal(result.structuredContent.mandateId, null);
    assert.match(result.content[0].text, /No criteria could be extracted/);
  } finally {
    await close();
  }
});

test("pipeline errors surface as recoverable tool errors", async () => {
  const { pipeline } = stubPipeline({
    handleMandateParse: async () => {
      throw new Error("OpenAI request failed");
    },
  });
  const { client, close } = await connectTestClient({}, { pipeline });
  try {
    const result = await client.callTool({
      name: "meredian_parse_mandate",
      arguments: { text: "anything" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /meredian_parse_mandate failed: OpenAI request failed/);
  } finally {
    await close();
  }
});

// --- thesis PDF ------------------------------------------------------------

async function tmpFile(name, contents) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "meredian-mcp-test-"));
  const filePath = path.join(dir, name);
  await fs.writeFile(filePath, contents);
  return { dir, filePath };
}

test("meredian_parse_thesis_pdf reads a PDF from disk and stores the mandate", async () => {
  const { pipeline, calls } = stubPipeline();
  const { client, store, close } = await connectTestClient({}, { pipeline });
  const { dir, filePath } = await tmpFile("thesis.pdf", "%PDF-1.4 fake body");
  try {
    const result = await client.callTool({
      name: "meredian_parse_thesis_pdf",
      arguments: { path: filePath },
    });

    assert.equal(result.isError ?? false, false);
    assert.equal(result.structuredContent.mandateId, "m1");
    assert.equal(result.structuredContent.sourceFile, filePath);
    assert.match(result.content[0].text, /Parsed thesis from thesis\.pdf/);
    assert.ok(store.getMandate("m1"));

    const call = calls.find((c) => c.fn === "handleThesisPdfParse");
    assert.equal(call.meta.mimetype, "application/pdf");
    assert.equal(call.meta.originalname, "thesis.pdf");
  } finally {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("meredian_parse_thesis_pdf rejects missing files, non-PDFs and empty files", async () => {
  const { pipeline } = stubPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  const { dir, filePath: txt } = await tmpFile("notes.txt", "hello");
  const { dir: dir2, filePath: empty } = await tmpFile("empty.pdf", "");
  try {
    const missing = await client.callTool({
      name: "meredian_parse_thesis_pdf",
      arguments: { path: path.join(dir, "absent.pdf") },
    });
    assert.equal(missing.isError, true);
    assert.match(missing.content[0].text, /No file at/);

    const wrongType = await client.callTool({
      name: "meredian_parse_thesis_pdf",
      arguments: { path: txt },
    });
    assert.equal(wrongType.isError, true);
    assert.match(wrongType.content[0].text, /Only PDF files are supported/);

    const emptyResult = await client.callTool({
      name: "meredian_parse_thesis_pdf",
      arguments: { path: empty },
    });
    assert.equal(emptyResult.isError, true);
    assert.match(emptyResult.content[0].text, /is empty/);
  } finally {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
    await fs.rm(dir2, { recursive: true, force: true });
  }
});

test("meredian_parse_thesis_pdf enforces the 8MB ceiling", async () => {
  const { pipeline, calls } = stubPipeline();
  const { client, close } = await connectTestClient({}, { pipeline });
  const { dir, filePath } = await tmpFile("big.pdf", Buffer.alloc(9 * 1024 * 1024, 0x20));
  try {
    const result = await client.callTool({
      name: "meredian_parse_thesis_pdf",
      arguments: { path: filePath },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /9\.0MB; the limit is 8MB/);

    // Oversized files must be rejected before the parser is invoked.
    assert.equal(calls.length, 0);
  } finally {
    await close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
