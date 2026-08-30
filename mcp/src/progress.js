/**
 * Bridge Zoron pipeline progress events onto MCP progress notifications.
 *
 * The pipeline reports work via `onProgress({ step, detail, at })` — the same
 * callback the SSE routes use to drive the web UI. MCP hosts consume progress
 * as `notifications/progress`, but only when the caller supplied a
 * `progressToken` in the request `_meta`. Without a token the spec forbids
 * sending them, so the bridge degrades to a no-op.
 *
 * Discovery is chatty and long-running (heavy search plus per-company
 * enrichment), so updates are throttled to avoid flooding the host.
 */

const DEFAULT_THROTTLE_MS = 250;

/**
 * @param extra   the handler's second argument, carrying `_meta` and `sendNotification`
 * @param options.total      expected step count, if known, for a progress bar
 * @param options.throttleMs minimum gap between notifications
 */
export function createProgressBridge(
  extra,
  { total = undefined, throttleMs = DEFAULT_THROTTLE_MS } = {}
) {
  const token = extra?._meta?.progressToken;
  const sendNotification = extra?.sendNotification;
  const events = [];

  // No token, or no way to send: collect events for the summary but stay quiet.
  const canNotify =
    token !== undefined && token !== null && typeof sendNotification === "function";

  let progress = 0;
  let lastSentAt = 0;
  let pending = null;
  let flushTimer = null;

  const emit = (payload) => {
    if (!canNotify) return;
    // Fire and forget: a failed notification must never break the tool call.
    Promise.resolve(
      sendNotification({
        method: "notifications/progress",
        params: { progressToken: token, ...payload },
      })
    ).catch(() => {});
  };

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      if (pending) {
        lastSentAt = Date.now();
        emit(pending);
        pending = null;
      }
    }, throttleMs);
    // Do not hold the event loop open on account of a progress timer.
    flushTimer.unref?.();
  }

  const onProgress = (evt) => {
    const step = String(evt?.step ?? "").trim();
    const detail = evt?.detail == null ? "" : String(evt.detail).trim();
    const message = detail ? `${step} — ${detail}` : step;

    progress += 1;
    events.push({ step, detail: detail || null, at: evt?.at ?? Date.now() });

    if (!canNotify || !message) return;

    const now = Date.now();
    const payload = { progress, message, ...(total != null ? { total } : {}) };

    if (now - lastSentAt >= throttleMs) {
      lastSentAt = now;
      pending = null;
      emit(payload);
    } else {
      // Coalesce bursts: keep only the most recent, flushed once the throttle
      // window clears.
      pending = payload;
      scheduleFlush();
    }
  };

  return {
    onProgress,
    events,
    get count() {
      return progress;
    },
    /** Emit any coalesced final event and stop the timer. */
    finish() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (pending) {
        emit(pending);
        pending = null;
      }
    },
  };
}
