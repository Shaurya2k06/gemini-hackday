/**
 * Single boundary between the MCP server and the Zoron pipeline.
 *
 * Every tool imports pipeline functions from here rather than reaching into
 * `../../server/src/**` directly. That keeps the coupling to one file and gives
 * tests a single seam to substitute.
 *
 * Node resolves a module's own imports relative to its own location, so the
 * pipeline modules below correctly pick up `server/node_modules` even though
 * this package has its own dependency tree.
 */
export {
  handleMandateParse,
  handleDiscoverStream,
  handleDiscoverExpandStream,
  resolveCompanyLookup,
  handleDeepDiveStream,
  answerGeneralInfo,
  extractCustomColumn,
  exportCompaniesCsv,
  exportCompaniesPdf,
  normalizeExportCompanies,
  formatCompanyCard,
  generateCsv,
  generatePdf,
  isValidCsv,
  isValidPdf,
} from "../../server/src/chatbot/index.js";

export { handleThesisPdfParse } from "../../server/src/chatbot/thesis-parse.js";

// --- Foresight: ownership-transition prediction ----------------------------
export { extractSignalsAsOf } from "../../server/src/foresight/extract-signals.js";
export { resolveOutcome } from "../../server/src/foresight/outcome-oracle.js";
export { runBacktest, formatBacktest } from "../../server/src/foresight/backtest.js";
export {
  scoreTransition,
  rankByTransition,
} from "../../server/src/foresight/transition-score.js";
export { SIGNALS, SIGNAL_KEYS } from "../../server/src/foresight/signals.js";
