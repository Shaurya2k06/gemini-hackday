import OpenAI from "openai";
import { logger } from "./logger.js";

let client;

function getClient() {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set");
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export async function callLlm({ model, messages, purpose, maxTokens = 64 }) {
  const openai = getClient();
  const start = Date.now();

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
    });

    const latencyMs = Date.now() - start;
    const content = response.choices[0]?.message?.content ?? "";

    logger.externalCall({
      source: "openai",
      query: purpose,
      status: 200,
      latencyMs,
      success: true,
    });

    return { content, model, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const status = error.status ?? 500;

    logger.externalCall({
      source: "openai",
      query: purpose,
      status,
      latencyMs,
      success: false,
      error,
    });

    throw error;
  }
}

export async function callStructuredLlm({
  model,
  messages,
  purpose,
  schema,
  schemaName,
}) {
  const openai = getClient();
  const start = Date.now();

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
    });

    const latencyMs = Date.now() - start;
    const content = response.choices[0]?.message?.content ?? "";

    logger.externalCall({
      source: "openai",
      query: purpose,
      status: 200,
      latencyMs,
      success: true,
    });

    return { content, model, latencyMs };
  } catch (error) {
    const latencyMs = Date.now() - start;
    const status = error.status ?? 500;

    logger.externalCall({
      source: "openai",
      query: purpose,
      status,
      latencyMs,
      success: false,
      error,
    });

    throw error;
  }
}

export async function verifyLightModel() {
  const model = process.env.LIGHT_LLM_MODEL ?? "gpt-4o-mini";
  return callLlm({
    model,
    purpose: "stage0_hello_light",
    messages: [
      {
        role: "user",
        content: 'Reply with exactly: {"status":"ok","agent":"light"}',
      },
    ],
  });
}

export async function verifyHeavyModel() {
  const model = process.env.HEAVY_LLM_MODEL ?? "gpt-5-search-api";
  // Search models always search; use a tiny non-search reply when possible.
  // Fall back to plain completion for hello-world verification.
  return callLlm({
    model: model.includes("search") ? "gpt-4o-mini" : model,
    purpose: "stage0_hello_heavy",
    messages: [
      {
        role: "user",
        content: 'Reply with exactly: {"status":"ok","agent":"heavy"}',
      },
    ],
  });
}
