/**
 * Normalize discovery constraint mode from API / UI.
 * @returns {'heavy' | 'lite'}
 */
export function normalizeConstraintMode(value) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "lite" ? "lite" : "heavy";
}

export function isLiteMode(value) {
  return normalizeConstraintMode(value) === "lite";
}
