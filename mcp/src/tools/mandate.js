import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { summarizeMandate } from "../format.js";
import { textResult, errorResult, guarded } from "./shared.js";

/** Matches the multer limit on POST /api/mandate/parse-thesis. */
const MAX_PDF_BYTES = 8 * 1024 * 1024;

/** `mergeFieldAddition` only handles these four fields; anything else is a no-op. */
const FIELD_HINTS = ["geography", "sector_tags", "funding_stage", "keywords"];

export function registerMandateTools(server, store, pipeline) {
  registerParseMandate(server, store, pipeline);
  registerParseThesisPdf(server, store, pipeline);
}

function storeAndSummarize(store, parsed) {
  const id = store.putMandate({
    structured: parsed.structured,
    pills: parsed.pills ?? [],
    intent: parsed.intent,
    accumulatedText: parsed.accumulatedText ?? "",
  });
  const entry = store.getMandate(id);

  return textResult(summarizeMandate(entry), {
    mandateId: id,
    intent: parsed.intent,
    structured: parsed.structured,
    pills: parsed.pills ?? [],
    accumulatedText: parsed.accumulatedText ?? "",
  });
}

function registerParseMandate(server, store, pipeline) {
  server.registerTool(
    "meredian_parse_mandate",
    {
      title: "Parse investment mandate",
      description:
        "Turn natural-language screening criteria into a structured PE mandate. " +
        "Returns a mandateId to pass to meredian_discover, plus the criteria found. " +
        "Build a mandate over several turns by passing the previous " +
        "`accumulatedText` and `priorStructured` back in with each new fragment. " +
        "Also detects when the user is asking about one named company rather than " +
        "screening (intent `company_lookup`) — use meredian_lookup_company then.",
      inputSchema: {
        text: z
          .string()
          .describe(
            "The new criteria fragment, e.g. 'European B2B SaaS with 10-50M revenue, founder-owned'."
          ),
        accumulatedText: z
          .string()
          .optional()
          .describe("Criteria gathered so far, from a previous call's accumulatedText."),
        priorStructured: z
          .record(z.any())
          .optional()
          .describe("The previous call's `structured` object, to merge this fragment into."),
        fieldHint: z
          .enum(FIELD_HINTS)
          .optional()
          .describe(
            "Force `text` to be interpreted as a value for this single field, " +
              "skipping intent detection. Use when the user is explicitly adding one criterion."
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guarded(
      "meredian_parse_mandate",
      async ({ text, accumulatedText, priorStructured, fieldHint }) => {
        const parsed = await pipeline.handleMandateParse({
          text,
          accumulatedText: accumulatedText ?? "",
          priorStructured: priorStructured ?? null,
          fieldHint: fieldHint ?? null,
        });

        if (!parsed.structured) {
          return textResult(
            "No criteria could be extracted — the input was empty. Describe the target profile: sector, geography, revenue or EBITDA range, ownership.",
            { mandateId: null, intent: parsed.intent, structured: null, pills: [] }
          );
        }

        return storeAndSummarize(store, parsed);
      }
    )
  );
}

function registerParseThesisPdf(server, store, pipeline) {
  server.registerTool(
    "meredian_parse_thesis_pdf",
    {
      title: "Parse investment thesis PDF",
      description:
        "Read an investment thesis PDF from disk and extract a structured mandate from it. " +
        "Returns a mandateId usable with meredian_discover. Requires a text-based PDF; " +
        "scanned image-only documents cannot be read.",
      inputSchema: {
        path: z
          .string()
          .describe("Absolute path to a .pdf file on the machine running this server."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    guarded("meredian_parse_thesis_pdf", async ({ path: filePath }) => {
      const resolved = path.resolve(filePath);

      if (path.extname(resolved).toLowerCase() !== ".pdf") {
        return errorResult(`Only PDF files are supported; got "${path.basename(resolved)}".`);
      }

      let stat;
      try {
        stat = await fs.stat(resolved);
      } catch {
        return errorResult(`No file at "${resolved}". Provide an absolute path to a PDF.`);
      }

      if (!stat.isFile()) return errorResult(`"${resolved}" is not a file.`);
      if (stat.size === 0) return errorResult(`"${resolved}" is empty.`);
      if (stat.size > MAX_PDF_BYTES) {
        const mb = (stat.size / 1024 / 1024).toFixed(1);
        return errorResult(`PDF is ${mb}MB; the limit is 8MB.`);
      }

      const buffer = await fs.readFile(resolved);
      const parsed = await pipeline.handleThesisPdfParse(buffer, {
        originalname: path.basename(resolved),
        mimetype: "application/pdf",
      });

      if (!parsed.structured) {
        return errorResult(
          `Extracted text from "${path.basename(resolved)}" but found no usable screening criteria in it.`
        );
      }

      const result = storeAndSummarize(store, parsed);
      result.content[0].text = `Parsed thesis from ${path.basename(resolved)}\n\n${result.content[0].text}`;
      result.structuredContent.sourceFile = resolved;
      return result;
    })
  );
}
