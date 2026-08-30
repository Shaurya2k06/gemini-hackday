import { transcribeAudio } from "../lib/llm.js";
import { handleMandateParse } from "./mandate-api.js";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

/**
 * Transcribe a spoken investment thesis and parse it into structured mandate fields.
 * @param {Buffer} buffer
 * @param {{ originalname?: string, mimetype?: string }} [fileMeta]
 */
export async function handleVoiceMandateParse(buffer, fileMeta = {}) {
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

  const result = await handleMandateParse({ text: transcript, accumulatedText: "" });
  return { ...result, transcript };
}
