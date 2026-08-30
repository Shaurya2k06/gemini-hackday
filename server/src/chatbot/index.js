import { generateCsv, generatePdf } from "./export.js";

export {
  handleMandateParse,
  handleDiscoverStream,
  handleDiscoverExpandStream,
  resolveCompanyLookup,
  handleDeepDiveStream,
} from "./mandate-api.js";
export { answerGeneralInfo } from "./general-info.js";
export { extractCustomColumn } from "./custom-column.js";

export function exportCompaniesCsv(rankedResults) {
  if (!rankedResults?.length) {
    return { error: "No results to export." };
  }
  return { csv: generateCsv(rankedResults), filename: "pef-discovery-results.csv" };
}

export function exportCompaniesPdf(rankedResults) {
  if (!rankedResults?.length) {
    return { error: "No results to export." };
  }
  return { pdf: generatePdf(rankedResults), filename: "pef-discovery-results.pdf" };
}

export { formatCompanyCard } from "./format.js";
export { generateCsv, generatePdf, isValidCsv, isValidPdf } from "./export.js";
