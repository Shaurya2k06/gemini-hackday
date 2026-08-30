/**
 * Persist Heavy/Lite discovery constraint mode in sessionStorage.
 */
const STORAGE_KEY = 'meredian.constraintMode';

export function normalizeConstraintMode(value) {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();
  return raw === 'lite' ? 'lite' : 'heavy';
}

export function loadConstraintMode() {
  try {
    return normalizeConstraintMode(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return 'heavy';
  }
}

export function saveConstraintMode(mode) {
  const next = normalizeConstraintMode(mode);
  try {
    sessionStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore quota / private mode
  }
  return next;
}
