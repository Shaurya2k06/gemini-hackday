import { z } from "zod";

/**
 * Reusable conversation starters.
 *
 * Prompts are user-selected templates, not automatic instructions — they give a
 * host's users a one-click entry into the two main Meredian workflows without
 * having to know the tool names or their ordering.
 *
 * MCP prompt arguments are always strings, so every schema here is z.string().
 */
export function registerPrompts(server) {
  server.registerPrompt(
    "screen_mandate",
    {
      title: "Screen for acquisition targets",
      description:
        "Run a full PE screen: build a mandate from a description, produce a ranked shortlist, then dig into the best fits.",
      argsSchema: {
        criteria: z
          .string()
          .describe(
            "The target profile in plain language, e.g. 'German industrial software, 10-40M revenue, founder-owned, no PE backing'."
          ),
        shortlistSize: z
          .string()
          .optional()
          .describe("Desired number of companies. Defaults to the pipeline's standard 10."),
      },
    },
    ({ criteria, shortlistSize }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Screen for acquisition targets matching: ${criteria}`,
              "",
              "Work through this in order:",
              "1. Call meredian_parse_mandate to turn the description into a structured mandate. Show me the criteria it extracted and flag anything it missed or guessed.",
              "2. Call meredian_discover with the returned mandateId to build the shortlist.",
              shortlistSize
                ? `3. If fewer than ${shortlistSize} companies come back, use meredian_expand_shortlist to top it up.`
                : "3. If the shortlist looks thin, use meredian_expand_shortlist to add more.",
              "4. Summarize the shortlist as a table: rank, company, geography, revenue, and why it fits.",
              "5. Call out which two or three warrant a deep dive and why, but wait for me before running them.",
              "",
              "Note any company where the data looks weak or unverified rather than presenting it as certain.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "company_dossier",
    {
      title: "Build a company dossier",
      description:
        "Research one named company and produce an investor-ready dossier with ownership, financials and sources.",
      argsSchema: {
        company: z.string().describe("Company name or domain, e.g. 'Personio' or 'personio.de'."),
        question: z
          .string()
          .optional()
          .describe("A specific angle to focus on, e.g. 'is it PE-backed?'."),
      },
    },
    ({ company, question }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: [
              `Build an investor dossier on ${company}.`,
              "",
              "1. Call meredian_lookup_company to resolve it and confirm you have the right entity — check the domain matches before going further.",
              question
                ? `2. Call meredian_deep_dive on that domain, passing userQuestion: "${question}".`
                : "2. Call meredian_deep_dive on that domain for the full profile.",
              "3. Report: what the business does, ownership and cap-table signals, size (revenue, EBITDA, headcount), leadership, competitive position, and an investment view.",
              "4. List the sources behind the key claims. Say explicitly which figures are estimates or unverified.",
              question ? `5. Answer directly: ${question}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );
}
