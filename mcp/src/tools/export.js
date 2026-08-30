import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { textResult, errorResult, guarded, McpError, ErrorCode } from "./shared.js";

const FORMATS = ["csv", "pdf"];

/** Where unqualified exports land. */
function defaultExportDir() {
  return path.join(os.tmpdir(), "meredian-exports");
}

/**
 * Resolve the output path, confining writes to the export directory unless the
 * caller supplies an explicit absolute path.
 *
 * A relative `outputPath` is treated as relative to the export dir and must not
 * escape it, so a model cannot be talked into writing over arbitrary files.
 */
export function resolveOutputPath(outputPath, format) {
  const dir = defaultExportDir();
  const defaultName = `meredian-shortlist-${Date.now()}.${format}`;

  if (!outputPath) return path.join(dir, defaultName);
  if (path.isAbsolute(outputPath)) return path.normalize(outputPath);

  const resolved = path.resolve(dir, outputPath);
  const withSep = dir.endsWith(path.sep) ? dir : dir + path.sep;
  if (!resolved.startsWith(withSep)) {
    throw new McpError(
      ErrorCode.InvalidParams,
      `Relative outputPath "${outputPath}" escapes the export directory. Pass an absolute path instead.`
    );
  }
  return resolved;
}

export function registerExportTools(server, store, pipeline) {
  server.registerTool(
    "meredian_export_shortlist",
    {
      title: "Export a shortlist to CSV or PDF",
      description:
        "Write a stored shortlist to a CSV or PDF file on disk and return the file path. " +
        "Any researched custom columns are included in CSV output. Defaults to a file in " +
        "the system temp directory; pass an absolute `outputPath` to choose the location.",
      inputSchema: {
        shortlistId: z.string().describe("Id from meredian_discover, e.g. 's1'."),
        format: z
          .enum(FORMATS)
          .optional()
          .describe(
            "'csv' (default, full data incl. custom columns) or 'pdf' (formatted report)."
          ),
        outputPath: z
          .string()
          .optional()
          .describe(
            "Absolute path for the output file. Relative paths resolve inside the export " +
              "directory. Defaults to a timestamped file in the system temp directory."
          ),
        includeGated: z
          .boolean()
          .optional()
          .describe(
            "Also export gated matches (incumbents and entities that failed diligence checks). Defaults to false."
          ),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    guarded("meredian_export_shortlist", async (args) => {
      const entry = store.getShortlist(args.shortlistId);
      if (!entry) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `No shortlist found with id "${args.shortlistId}". Run meredian_discover first.`
        );
      }

      const format = args.format ?? "csv";
      const cards = args.includeGated
        ? [...entry.cards, ...(entry.otherCards ?? [])]
        : entry.cards;

      if (!cards.length) {
        return errorResult(`Shortlist "${args.shortlistId}" has no companies to export.`);
      }

      const rows = pipeline.normalizeExportCompanies(cards);
      const customColumns = entry.customColumns ?? [];

      const result =
        format === "pdf"
          ? pipeline.exportCompaniesPdf(rows)
          : pipeline.exportCompaniesCsv(rows, { customColumns });

      if (result.error) return errorResult(result.error);

      const target = resolveOutputPath(args.outputPath, format);
      await fs.mkdir(path.dirname(target), { recursive: true });

      // The PDF generator returns a binary-encoded string, not a Buffer.
      if (format === "pdf") {
        await fs.writeFile(target, Buffer.from(result.pdf, "binary"));
      } else {
        await fs.writeFile(target, result.csv, "utf8");
      }

      const { size } = await fs.stat(target);
      const lines = [
        `Exported ${cards.length} companies from shortlist ${args.shortlistId} as ${format.toUpperCase()}.`,
        `  file: ${target}`,
        `  size: ${size} bytes`,
      ];
      if (format === "csv" && customColumns.length) {
        lines.push(`  custom columns: ${customColumns.join(", ")}`);
      }
      if (format === "pdf" && customColumns.length) {
        lines.push(
          `  note: custom columns (${customColumns.join(", ")}) appear in CSV output only.`
        );
      }

      return textResult(lines.join("\n"), {
        shortlistId: args.shortlistId,
        format,
        path: target,
        bytes: size,
        companyCount: cards.length,
        customColumns,
      });
    })
  );
}
