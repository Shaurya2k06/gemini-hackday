import { transcribeAudio } from "../lib/llm.js";
import { handleMandateParse } from "./mandate-api.js";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/**
 * Transcribe a spoken investment thesis fragment and parse it into structured mandate
 * fields. When `priorStructured`/`accumulatedText` are given, the transcript is merged
 * into that existing mandate (same contract as the typed `/mandate/parse` route) so a
 * voice note can refine an in-progress or already-run search instead of starting over.
 * @param {Buffer} buffer
 * @param {{ originalname?: string, mimetype?: string }} [fileMeta]
 * @param {{ priorStructured?: object|null, accumulatedText?: string }} [context]
 */
export async function handleVoiceMandateParse(buffer, fileMeta = {}, context = {}) {
  if (!buffer?.length) {
    throw new Error("Audio recording is required");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("Audio recording is too long");
  }

  const mimeType = String(fileMeta.mimetype ?? "audio/webm").toLowerCase();
  const { text: transcript } = await transcribeAudio({
    base64Audio: buffer.toString("base64"),
    mimeType,
  });

  if (!transcript) {
    throw new Error("Could not understand the recording. Try speaking clearly and try again.");
  }

  const result = await handleMandateParse({
    text: transcript,
    accumulatedText: context.accumulatedText ?? "",
    priorStructured: context.priorStructured ?? null,
  });
  return { ...result, transcript };
}
