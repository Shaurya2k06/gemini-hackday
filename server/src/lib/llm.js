import { logger } from "./logger.js";

function getApiKey() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return apiKey;
}

function splitMessages(messages) {
  const system = messages
    .filter(({ role }) => role === "system")
    .map(({ content }) => String(content ?? ""))
    .join("\n\n");
  const contents = messages
    .filter(({ role }) => role !== "system")
    .map(({ role, content }) => ({
      role: role === "assistant" ? "model" : "user",
      parts: [{ text: String(content ?? "") }],
    }));
  return { systemInstruction: system || undefined, contents };
}

async function generateContent({ model, messages, maxTokens, schema, search = false }) {
  const { systemInstruction, contents } = splitMessages(messages);
  const body = {
    ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      // `responseSchema` expects Gemini's protobuf Schema format. Our callers
      // provide standard JSON Schema (including nullable type arrays and
      // additionalProperties), which must use `responseJsonSchema` instead.
      ...(schema
        ? { responseMimeType: "application/json", responseJsonSchema: schema }
        : {}),
    },
    ...(search ? { tools: [{ googleSearch: {} }] } : {}),
  };
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": getApiKey(),
      },
      body: JSON.stringify(body),
    }
  );
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error?.message ?? `Gemini request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function responseText(response) {
  return response.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
}

export async function callLlm({ model, messages, purpose, maxTokens = 64 }) {
  const start = Date.now();

  try {
    const response = await generateContent({
      model,
      messages,
      maxTokens,
    });

    const latencyMs = Date.now() - start;
    const content = responseText(response);

    logger.externalCall({
      source: "gemini",
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
      source: "gemini",
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
  const start = Date.now();

  try {
    const response = await generateContent({
      model,
      messages,
      schema,
    });

    const latencyMs = Date.now() - start;
    const content = responseText(response);

    logger.externalCall({
      source: "gemini",
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
      source: "gemini",
      query: purpose,
      status,
      latencyMs,
      success: false,
      error,
    });

    throw error;
  }
}

export async function callGeminiSearch({ model, messages, purpose, maxTokens = 16384 }) {
  const start = Date.now();
  try {
    // Grounded search spends a large share of the output budget on reasoning
    // tokens, so this ceiling is deliberately generous: too low a value gets
    // the company list cut off mid-JSON.
    const response = await generateContent({ model, messages, maxTokens, search: true });
    const finishReason = response.candidates?.[0]?.finishReason ?? null;
    return {
      content: responseText(response),
      model,
      latencyMs: Date.now() - start,
      finishReason,
      truncated: finishReason === "MAX_TOKENS",
    };
  } catch (error) {
    error.purpose = purpose;
    throw error;
  }
}

export async function verifyLightModel() {
  const model = process.env.LIGHT_LLM_MODEL ?? "gemini-flash-latest";
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
  const model = process.env.HEAVY_LLM_MODEL ?? "gemini-flash-latest";
  return callLlm({
    model,
    purpose: "stage0_hello_heavy",
    messages: [
      {
        role: "user",
        content: 'Reply with exactly: {"status":"ok","agent":"heavy"}',
      },
    ],
  });
}
