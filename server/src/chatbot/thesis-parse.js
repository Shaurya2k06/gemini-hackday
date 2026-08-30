import { PDFParse } from "pdf-parse";
import { handleMandateParse } from "./mandate-api.js";

const MAX_THESIS_CHARS = 24_000;

/**
 * Extract text from an investment thesis PDF and parse into structured mandate fields.
 * @param {Buffer} buffer
 * @param {{ originalname?: string, mimetype?: string }} [fileMeta]
 */
export async function handleThesisPdfParse(buffer, fileMeta = {}) {
  if (!buffer?.length) {
    throw new Error("PDF file is required");
  }

  const mime = String(fileMeta.mimetype ?? "").toLowerCase();
  const name = String(fileMeta.originalname ?? "").toLowerCase();
  const looksPdf = mime === "application/pdf" || name.endsWith(".pdf");
  if (!looksPdf) {
    throw new Error("Only PDF files are supported");
  }

  let extracted = "";
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const parsed = await parser.getText();
    extracted = String(parsed?.text ?? "").trim();
  } catch {
    throw new Error("Could not read PDF text. Try a text-based PDF.");
  } finally {
    await parser.destroy().catch(() => {});
  }

  if (!extracted) {
    throw new Error("No extractable text found in PDF");
  }

  const text =
    extracted.length > MAX_THESIS_CHARS
      ? extracted.slice(0, MAX_THESIS_CHARS)
      : extracted;

  return handleMandateParse({ text, accumulatedText: "" });
}
