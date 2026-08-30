# Zoron

## AI-native private-equity sourcing, from mandate to defensible shortlist

**Version:** Demo / hackday edition  
**Audience:** Investment teams, operating partners, innovation leaders, and evaluators  
**Category:** Private-equity deal sourcing and initial diligence

## Executive summary

Private-equity teams need to turn an evolving investment thesis into a credible pipeline of companies. Today that work is usually fragmented across analyst research, search engines, spreadsheets, proprietary data products, and institutional memory. It is difficult to repeat, slow to refresh, and hard to explain when a company should be included or excluded.

Zoron is an AI-native sourcing workflow for that first-mile problem. An investor states a mandate in plain English—such as sector, geography, revenue or EBITDA band, size, and exclusions. Zoron converts it into structured criteria, performs grounded public-web research, vets and ranks candidate companies, and returns a shortlist with source-backed company cards. The team can investigate a company in depth, add a custom research field across the list, or export the result to CSV/PDF.

The product is designed to accelerate research, not to replace investment judgment. Every output is a starting point for human diligence. Zoron makes the first pass faster, more consistent, and more legible.

## The problem

### A mandate is not a database query

Investment theses begin as nuanced language: *European vertical software, €10–30m revenue, founder-led, avoid regulated lending, with room for operational improvement.* Translating that into multiple data products and analyst workstreams loses context. Rigid filters also struggle with incomplete private-company data, changing terminology, and criteria that are qualitative rather than binary.

### The sourcing environment rewards a data-backed edge

Private equity is operating in a more selective market. Bain describes a narrow 2025 recovery, persistent fundraising pressure, and a world without easy multiple expansion; it argues that winning firms will need clearer, data-backed edges and stronger value creation. [Bain, *Global Private Equity Report 2026*](https://www.bain.com/insights/topics/global-private-equity-report/)

At the same time, private-market data is inherently uneven. US regulatory statistics aggregate Form PF/ADV information, but fund-level Form PF information is confidential and public data does not provide a complete company-level source of truth. [US SEC, *Private Fund Statistics*](https://www.sec.gov/data-research/investment-management-data/division-investment-management-private-fund-statistics) This makes a transparent research workflow—rather than an opaque “answer engine”—especially valuable.

### The real bottleneck is synthesis and prioritisation

The work is not simply finding names. It is deciding:

- Does the company actually fit the thesis?
- Which claims are grounded in a source, and which are unknown?
- Why was a near-match excluded?
- Which companies deserve scarce partner and analyst time first?

Industry research identifies deal sourcing and due diligence as practical GenAI use cases, while also stressing the need for a human in the loop to manage accuracy, bias, and hallucination risk. [Preqin / Robin AI](https://www.preqin.com/news/generative-ai-tools-can-accelerate-fundraising-deal-sourcing-and-due)

## The solution: Zoron

Zoron turns an investment mandate into a repeatable research pipeline:

```text
Plain-English mandate
        ↓
Structured criteria and exclusions
        ↓
Grounded market discovery
        ↓
Entity normalisation, quality gates, and thesis vetting
        ↓
Ranked shortlist with evidence and confidence signals
        ↓
Company dossier, custom research, and export
```

The aim is not to claim that an LLM “knows” the private market. The aim is to give an investment team a fast, inspectable route from thesis to an evidence-bearing research queue.

## Product capabilities

| Capability | What it does | Investor value |
|---|---|---|
| Plain-English mandate | Parses sector, geography, financial ranges, stage, keywords, company names, and exclusions into structured criteria. | Retains investment nuance without forcing a rigid intake form. |
| Incremental mandate building | Merges follow-up instructions into the existing mandate. | Lets a thesis evolve naturally during a conversation. |
| Thesis PDF intake | Extracts a mandate from an uploaded investment-thesis PDF. | Reuses the team’s existing work instead of recreating it. |
| Voice mandate intake | Transcribes and structures an audio instruction. | Supports fast ideation and partner-led workflows. |
| Grounded discovery | Uses Gemini with Google Search grounding to discover and research companies from current public sources. | Produces a fresh research pass with source provenance. |
| Screening and vetting | Applies geography, financial-band, entity-plausibility, sector, stage, and mandate-quality gates; flags exclusions. | Separates likely targets from events, incumbents, irrelevant entities, and thesis mismatches. |
| Ranking | Scores and explains candidate fit against the mandate. | Focuses scarce diligence time on the strongest candidates. |
| Company lookup and deep dive | Resolves a named company or creates a company dossier with cited sources. | Moves from a broad screen to an investment conversation. |
| Custom column research | Adds one question across the shortlist (for example, “European offices” or “founder ownership signal”). | Enables quick, thesis-specific comparison. |
| Exports | Produces CSV and PDF shortlist exports. | Fits the existing deal-team handoff and review process. |
| Research history | Stores users and saved chats in Neon PostgreSQL. | Preserves repeatable team workflow and retrieval of prior screens. |
| MCP interface | Exposes the same workflow as tools, resources, and prompts for compatible AI clients. | Lets Zoron work inside agent-enabled environments as well as its web app. |

## How it works

### 1. Capture the investment intent

The user can type, upload a thesis PDF, or record a mandate. Zoron interprets the request as a structured object rather than treating it as a one-off prompt. This includes hard criteria such as geography and revenue, plus softer criteria such as sector language, business model, and exclusions.

### 2. Discover and enrich candidates

Zoron sends a fresh research request through Gemini using Google Search grounding. Google documents grounding as a way to connect model responses to real-time web content and provide citations; Zoron uses that capability to make company research traceable rather than relying solely on model memory. [Google AI for Developers, *Grounding with Google Search*](https://ai.google.dev/gemini-api/docs/google-search)

### 3. Normalise, gate, and rank

The pipeline normalises company information and applies deterministic and model-assisted checks. It filters entities that fail hard mandate constraints, detects likely non-company entities, and assigns fit/confidence information. This is deliberately a screening layer: unknown information remains unknown rather than being converted into an unsupported fact.

### 4. Review evidence, then take the next action

The resulting shortlist presents the rationale and research detail required for a human reviewer to decide what to pursue. A team can open a deep dive, request a cross-list custom field, expand the list, or export the work product.

## Product architecture

```text
React + Vite web application
        │  authenticated API calls / server-sent progress
        ▼
Express API
        ├── mandate, discovery, dossier, export workflows
        ├── session-based authentication and chat history
        └── Streamable HTTP MCP endpoint
        │
        ├── Gemini Flash: extraction, research, synthesis
        ├── Google Search grounding: current public-web evidence
        └── Neon PostgreSQL: users, sessions, saved chats

MCP clients ── stdio or HTTP ──► the same Zoron pipeline
```

The MCP layer exposes tools for health checks, mandate parsing, discovery, shortlist expansion, company lookup, deep dives, custom columns, general PE questions, and exports. MCP standardises how AI applications access tools, resources, and prompts. [Model Context Protocol specification](https://modelcontextprotocol.io/specification/2025-06-18/server/index)

## Differentiation

| Traditional workflow | Generic AI chat | Zoron |
|---|---|---|
| Manual research across disconnected tools | Fast but often unstructured and difficult to audit | Mandate-first workflow tied to structured criteria |
| Spreadsheet is the source of truth | Answer is the source of truth | Evidence-bearing shortlist is the work product |
| Inclusion/exclusion rationale is inconsistent | Model may confidently invent details | Gates, source signals, and explicit unknowns support review |
| Research lives in individual analysts’ files | Context is transient | Saved workflows, exports, and MCP resources support reuse |

Zoron is not positioned as a replacement for proprietary-data providers, CRM systems, or investment committees. It is the workflow layer that turns a thesis into a faster, more structured, public-information research process.

## Demo narrative (5–7 minutes)

### Opening: establish the pain (30 seconds)

“A partner gives an analyst a thesis in a sentence. The analyst then spends days translating it into filters, searches, spreadsheets, and one-off company notes. Zoron turns that first pass into a repeatable workflow.”

### Step 1: state a concrete mandate (45 seconds)

Enter: **“Find founder-led B2B vertical software companies in Germany, €15–40m revenue, 50–200 employees; exclude fintech lenders.”**

Point out the criteria pills and structured mandate. Emphasise that Zoron captures both the constraints and exclusions.

### Step 2: show the live research workflow (90 seconds)

Run discovery and narrate the progress events: mandate received, market research, company vetting, ranking. Explain that the system uses grounded public-web research and screens candidates against the mandate before presenting them.

### Step 3: review the shortlist (90 seconds)

Open the results. Pick one high-fit name and one excluded or uncertain name. Show that the key value is the *reason*: a deal team can see why a company was prioritised, rejected, or left uncertain.

### Step 4: open a dossier and ask a custom question (90 seconds)

Open the top company’s deep dive. Then add a custom column such as **“Evidence of DACH customer concentration”** or **“Does the company appear to sell mission-critical workflow software?”** This demonstrates thesis-specific research without rebuilding the whole screen.

### Step 5: close the loop (45 seconds)

Export the list to CSV/PDF and show the saved chat history. Optional: invoke the MCP health tool and explain that the same research capability can be used from an MCP-compatible agent client.

### Demo fallback

Live public-web research can be variable. Prepare a saved successful shortlist and a pre-opened company dossier. Do not present generated output as verified fact; use the source links and the “unknown” state as part of the demonstration of responsible workflow design.

## Pitch framing

### One-line pitch

**Zoron is an AI-native deal-sourcing analyst that converts a PE thesis into a vetted, evidence-bearing shortlist in minutes.**

### Why now

- PE firms need sharper, data-backed differentiation as dealmaking recovers unevenly and easy multiple expansion is less available. [Bain](https://www.bain.com/insights/topics/global-private-equity-report/)
- Public information changes continuously, while private-company data is incomplete and inconsistent—creating demand for a flexible research workflow rather than another static database.
- GenAI is moving from experimentation toward sourcing and diligence workflows, provided human review and evidence controls remain central. [Preqin / Robin AI](https://www.preqin.com/news/generative-ai-tools-can-accelerate-fundraising-deal-sourcing-and-due)
- MCP is becoming a standard way for AI clients to interact with external tools and resources, enabling Zoron to meet users where they work. [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18/server/index)

### Buyer and user

| Buyer | Daily user | Initial use case |
|---|---|---|
| PE fund partner, head of strategy, operating partner, or innovation lead | Analyst, associate, principal, or deal team | New platform screen, add-on acquisition scan, sector map, or company triage |

### Value hypothesis

The measurable value is not “AI answers.” It is faster time from mandate to a reviewable shortlist, more companies assessed per analyst hour, and clearer documentation of why a company was included, excluded, or marked unknown.

Suggested pilot KPIs:

- Time from mandate submission to first reviewable shortlist
- Number of candidates reviewed per analyst hour
- Percentage of shortlist cards with usable source evidence
- Partner acceptance rate for top-ranked candidates
- Percentage of excluded candidates with a clear exclusion reason
- Repeat use and saved-screen reuse by the deal team

## Trust, security, and responsible use

### What Zoron does today

- Uses session-based web authentication and stores users/chats in Neon PostgreSQL.
- Uses Gemini API calls and grounded public-web research for live discovery and enrichment.
- Limits uploads to PDF theses (8 MB) and audio input (15 MB).
- Keeps MCP-session data isolated in memory and expires inactive HTTP MCP sessions.

### Important demo limitations

- Public-web evidence is not a substitute for commercial diligence, management calls, legal review, financial verification, sanctions checks, or investment-committee judgment.
- Private-company financial data can be sparse or stale; a revenue/EBITDA match should be treated as a research signal until independently verified.
- The demo MCP HTTP endpoint is intentionally unauthenticated. It must be protected with authentication, authorisation, rate limiting, and audit logging before production use.
- Model and search results can be incomplete or wrong. A reviewer should inspect cited sources and retain final decision authority.
- The system should not be used to make autonomous investment decisions or to process confidential deal materials without a production security review.

## Delivery roadmap

### Current demo

- Mandate-to-shortlist workflow
- Grounded public-web discovery and company dossiers
- Vetting, ranking, exclusions, custom fields, exports
- Saved web sessions and MCP access

### Pilot-ready next steps

- Enterprise SSO, role-based access, audit trail, and authenticated MCP
- Source-level citation display, evidence recency, and reviewer approval states
- CRM integration and firm-specific thesis templates
- Feedback capture for accepted/rejected targets and ranking evaluation
- Monitoring for cost, latency, model failures, and source quality

### Production expansion

- Licensed-data integrations where appropriate
- Private knowledge connectors with permissions-aware retrieval
- Portfolio and CRM context, relationship intelligence, and workflow automation
- Evaluation dataset built from historical sourcing decisions, with bias and quality review

## Anticipated questions

**Is this a replacement for PitchBook, Capital IQ, or a CRM?**  
No. Zoron is a workflow and research layer. It can complement proprietary data and CRM systems; it does not claim to replace licensed datasets or internal records.

**How do you prevent hallucinations?**  
Zoron uses grounded web research, normalisation and gating, source-bearing dossiers, and explicit uncertainty. These controls reduce risk; they do not eliminate the need for human verification.

**Why use an LLM instead of filters?**  
Filters remain valuable for known, structured fields. Zoron adds value where a thesis is expressed in natural language, data is incomplete, and the team needs synthesis and rationale rather than only a database result.

**What is defensible?**  
The defensible asset is the workflow: mandate interpretation, gating, evidence-aware company cards, team feedback, integrations, and a growing corpus of accepted/rejected decisions—not a claim that public-web data alone is proprietary.

## Technical notes

| Layer | Implementation |
|---|---|
| Web app | React + Vite |
| API | Express with server-sent events for research progress |
| AI | Gemini Flash for structured extraction and research synthesis |
| Grounding | Gemini Google Search grounding |
| Data | Neon PostgreSQL for users, sessions, and saved chats |
| MCP | Model Context Protocol SDK over stdio plus Streamable HTTP |
| Exports | CSV and PDF |

## Sources

1. Bain & Company, [*Global Private Equity Report 2026*](https://www.bain.com/insights/topics/global-private-equity-report/), accessed August 2026.
2. US Securities and Exchange Commission, [*Private Fund Statistics*](https://www.sec.gov/data-research/investment-management-data/division-investment-management-private-fund-statistics), accessed August 2026.
3. Preqin, [*Generative AI tools can accelerate fundraising, deal sourcing, and due diligence*](https://www.preqin.com/news/generative-ai-tools-can-accelerate-fundraising-deal-sourcing-and-due), February 2025.
4. Google AI for Developers, [*Grounding with Google Search*](https://ai.google.dev/gemini-api/docs/google-search), accessed August 2026.
5. Model Context Protocol, [*Server specification overview*](https://modelcontextprotocol.io/specification/2025-06-18/server/index), accessed August 2026.

---

*Zoron is a research-assistance product. It does not provide investment, legal, tax, or financial advice.*
