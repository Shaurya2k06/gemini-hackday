# Zoron pitch

## The one-liner

**Zoron turns a private-equity investment thesis into a vetted, evidence-backed shortlist in minutes—not days.**

## The problem

Private-equity sourcing is still fragmented. A partner describes an investment thesis; an analyst then translates it into filters, web searches, spreadsheets, company notes, and follow-up questions. Context is lost, private-company data is incomplete, and it is difficult to explain why a company was included or excluded.

Generic AI chat can generate names, but a deal team needs a workflow: structured constraints, evidence, exclusions, ranking, and a handoff-ready output.

## The solution

Zoron is an AI-native sourcing workflow for private equity. A user gives it a mandate in natural language, a thesis PDF, or voice input. Zoron structures the mandate, runs grounded public-web research, screens candidate companies against the thesis, ranks the strongest matches, and produces a shortlist and company dossiers for human review.

Zoron accelerates research; it does not replace investment judgment or diligence.

## Features

### 1. Plain-English mandates

Users describe a target naturally:

> Find founder-led B2B vertical software companies in Germany, €15–40m revenue, 50–200 employees; exclude fintech lenders.

Zoron extracts sector, geography, revenue/EBITDA bands, company size, stage, keywords, named companies, and exclusions into structured screening criteria. Follow-up instructions can refine the same mandate instead of starting again.

### 2. Investment-thesis PDF ingestion

Users can upload an investment-thesis PDF. Zoron extracts the relevant criteria and applies them to the mandate workflow, so the team can reuse existing investment materials instead of rewriting them into filters.

### 3. Voice mandate intake

Users can record a mandate. Zoron transcribes and structures the request, making it easy to capture a partner’s thinking while it is fresh.

### 4. Grounded live-web discovery

Zoron uses Gemini with Google Search grounding to find and enrich candidate companies from current public sources. This gives the workflow a fresh research pass and supports source-backed company information rather than relying only on model memory.

### 5. Mandate vetting and quality gates

Discovery is not just a keyword search. Zoron checks candidates against the mandate and filters likely mismatches, including:

- Geography conflicts
- Revenue/EBITDA and size-band mismatches
- Sector or business-model mismatches
- Stage mismatches
- Named exclusions
- Likely events, associations, incumbents, or other non-target entities

This makes the shortlist more useful than a raw list of companies and exposes why a candidate is not a fit.

### 6. Ranked shortlist

Zoron returns an at-a-glance company shortlist with fit and confidence signals. The goal is to direct scarce partner and analyst attention toward the most relevant next conversations—not to make an autonomous investment decision.

### 7. Company lookup

If a user already has a company in mind, Zoron can resolve that company directly and assess it in the same mandate-aware workflow.

### 8. Deep-dive company dossiers

From any shortlist card, the team can open a detailed company dossier with public-source research and an investor-oriented view of the business. This is the bridge from broad market mapping to a real diligence conversation.

### 9. Custom research columns

Users can ask one additional question across every company in a shortlist, such as:

- “Evidence of DACH customer concentration”
- “Does the company sell mission-critical workflow software?”
- “Signals of founder ownership”

This lets the deal team add thesis-specific comparison data without rebuilding the whole screen.

### 10. Shortlist expansion

If the first screen is promising but incomplete, Zoron can find more candidates while excluding companies already returned. The team can widen a market map without creating duplicates.

### 11. CSV and PDF exports

Teams can export ranked shortlists for sharing, follow-up, and offline review. This fits existing deal-team workflows rather than forcing users to keep the work inside an AI interface.

### 12. Saved research history

Authenticated users can save and revisit prior chats and shortlist work. This preserves mandate context and makes sourcing more repeatable across the team.

### 13. MCP integration

Zoron exposes its pipeline through the Model Context Protocol (MCP). MCP-compatible clients can parse mandates, discover companies, deepen research, add custom columns, and export shortlists using the same workflow.

This means Zoron is available both as a dedicated web application and as a capability inside agent-enabled tools.

### 14. Streaming research progress

Research can take time. Zoron streams live progress updates through the UI, making the workflow transparent instead of leaving users with an unexplained loading state.

## How the demo should run

### Opening (30 seconds)

“Deal teams receive nuanced mandates, then spend days turning them into filters, searches, spreadsheets, and company notes. Zoron turns that first pass into a repeatable sourcing workflow.”

### Step 1: create a mandate (45 seconds)

Enter the example mandate:

> Find founder-led B2B vertical software companies in Germany, €15–40m revenue, 50–200 employees; exclude fintech lenders.

Show the structured criteria. Say: “Zoron preserves the constraints and exclusions behind the investment thesis.”

### Step 2: run discovery (60 seconds)

Start discovery and show progress. Say: “Zoron runs grounded public-web research, normalises candidates, and applies mandate checks before presenting a shortlist.”

### Step 3: review the shortlist (90 seconds)

Open one strong candidate, then one uncertain or excluded candidate. Say: “The product’s value is not just finding names—it is explaining fit, evidence, and uncertainty.”

### Step 4: open a dossier and add a custom field (90 seconds)

Open the strongest company’s dossier. Then run a custom-column question across the shortlist. This demonstrates that Zoron adapts to the thesis instead of providing a fixed database view.

### Step 5: export and close (30 seconds)

Export the shortlist. Say: “The analyst leaves with a reviewable, handoff-ready work product—not just a chat answer.”

## Why Zoron is different

| A traditional workflow | Generic AI chat | Zoron |
|---|---|---|
| Manual searches and disconnected spreadsheets | Fast answers but weak structure | Mandate-first sourcing workflow |
| Static filters and incomplete fields | Often lacks an audit trail | Evidence-aware shortlist and company dossiers |
| Analyst-specific notes | Transient conversation context | Saved research, exports, and MCP resources |
| Unclear inclusion/exclusion rationale | Risk of confident unsupported claims | Gates, exclusions, source signals, and explicit unknowns |

## Trust and positioning

Zoron is a research-assistance layer, not a replacement for proprietary-data platforms, CRM systems, management calls, commercial diligence, legal diligence, or an investment committee. Public-web findings and financial estimates are research signals that require human verification.

## Closing statement

**Zoron gives PE teams a faster and more consistent path from investment thesis to a shortlist they can actually review, challenge, and act on.**
