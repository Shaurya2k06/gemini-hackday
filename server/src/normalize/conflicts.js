import { logger } from "../lib/logger.js";
import { normalizeName } from "./entity-resolution.js";

function fieldValuesConflict(field, a, b) {
  if (a == null || b == null) return false;
  if (field === "name") {
    return normalizeName(String(a)) !== normalizeName(String(b));
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const sa = [...new Set(a.map(String))].sort().join("|");
    const sb = [...new Set(b.map(String))].sort().join("|");
    return sa !== sb;
  }
  return String(a).trim().toLowerCase() !== String(b).trim().toLowerCase();
}

/**
 * Detect field-level conflicts across source candidates.
 * Returns conflict records with all disagreeing values and their sources.
 */
export function detectConflicts(fieldCandidates) {
  const conflicts = [];

  for (const [field, candidates] of Object.entries(fieldCandidates)) {
    const withValues = candidates.filter(
      (c) =>
        c.value != null &&
        c.value !== "" &&
        !(Array.isArray(c.value) && c.value.length === 0)
    );
    if (withValues.length < 2) continue;

    const groups = [];
    for (const c of withValues) {
      let placed = false;
      for (const group of groups) {
        if (!fieldValuesConflict(field, group.representative, c.value)) {
          group.entries.push({ value: c.value, source: c.source });
          placed = true;
          break;
        }
      }
      if (!placed) {
        groups.push({
          representative: c.value,
          entries: [{ value: c.value, source: c.source }],
        });
      }
    }

    if (groups.length > 1) {
      conflicts.push({
        field,
        values: groups.flatMap((g) => g.entries),
      });
    }
  }

  return conflicts;
}

export function logConflicts(conflicts, { domain, name } = {}) {
  for (const conflict of conflicts) {
    logger.info("normalize_field_conflict", {
      domain,
      name,
      field: conflict.field,
      values: conflict.values,
    });
  }
}
