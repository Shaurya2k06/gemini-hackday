import { callLlm } from "../lib/llm.js";

const SYSTEM_PROMPT = `You are a Private Equity deal-sourcing analyst assistant.
Answer questions about PE concepts, sourcing workflows, diligence, and financial metrics clearly and concisely.
When the user asks a factual question about a specific company (ownership, funding, leadership, business model), answer directly using your knowledge and note if information may be dated.
Do not invent company lists or run discovery searches unless explicitly asked to find companies.
Keep answers under 3 short paragraphs.`;

export async function answerGeneralInfo(question) {
  const model = process.env.LIGHT_LLM_MODEL ?? "gemini-flash-latest";
  const { content } = await callLlm({
    model,
    purpose: "general_info",
    maxTokens: 600,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: String(question ?? "").trim() },
    ],
  });
  return content.trim();
}
