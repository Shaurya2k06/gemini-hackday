import test from "node:test";
import assert from "node:assert/strict";
import { createProgressBridge } from "../src/progress.js";

const NO_TOKEN = Symbol("no-token");

function fakeExtra({ token = "tok-1", capture = [] } = {}) {
  return {
    extra: {
      // `token: NO_TOKEN` models a client that omitted progressToken. A plain
      // `undefined` would instead trigger the default parameter above.
      _meta: token === NO_TOKEN ? {} : { progressToken: token },
      sendNotification: async (n) => {
        capture.push(n);
      },
    },
    capture,
  };
}

test("emits a progress notification carrying the caller's token", async () => {
  const { extra, capture } = fakeExtra();
  const bridge = createProgressBridge(extra, { throttleMs: 0 });

  bridge.onProgress({ step: "Starting target screening…", detail: null, at: Date.now() });
  await new Promise((r) => setImmediate(r));

  assert.equal(capture.length, 1);
  assert.equal(capture[0].method, "notifications/progress");
  assert.equal(capture[0].params.progressToken, "tok-1");
  assert.equal(capture[0].params.progress, 1);
  assert.equal(capture[0].params.message, "Starting target screening…");
});

test("appends detail to the step message", async () => {
  const { extra, capture } = fakeExtra();
  const bridge = createProgressBridge(extra, { throttleMs: 0 });

  bridge.onProgress({ step: "Opening dossier", detail: "Acme Analytics" });
  await new Promise((r) => setImmediate(r));

  assert.equal(capture[0].params.message, "Opening dossier — Acme Analytics");
});

test("includes total when the step count is known", async () => {
  const { extra, capture } = fakeExtra();
  const bridge = createProgressBridge(extra, { throttleMs: 0, total: 5 });

  bridge.onProgress({ step: "Enriching" });
  await new Promise((r) => setImmediate(r));

  assert.equal(capture[0].params.total, 5);
});

test("is a no-op when the client supplied no progressToken", async () => {
  const { extra, capture } = fakeExtra({ token: NO_TOKEN });
  const bridge = createProgressBridge(extra, { throttleMs: 0 });

  bridge.onProgress({ step: "Should not be sent" });
  bridge.onProgress({ step: "Nor this" });
  await new Promise((r) => setImmediate(r));

  assert.equal(capture.length, 0, "spec forbids progress without a token");
  // Events are still recorded so the tool can summarize what happened.
  assert.equal(bridge.count, 2);
  assert.equal(bridge.events.length, 2);
});

test("tolerates a missing extra object entirely", () => {
  const bridge = createProgressBridge(undefined, { throttleMs: 0 });
  assert.doesNotThrow(() => bridge.onProgress({ step: "safe" }));
  assert.equal(bridge.count, 1);
});

test("throttling coalesces a burst into a single trailing notification", async () => {
  const { extra, capture } = fakeExtra();
  const bridge = createProgressBridge(extra, { throttleMs: 40 });

  // First passes immediately; the rest fall inside the throttle window.
  for (let i = 1; i <= 6; i += 1) bridge.onProgress({ step: `step ${i}` });
  await new Promise((r) => setImmediate(r));
  assert.equal(capture.length, 1, "only the leading event sends immediately");

  await new Promise((r) => setTimeout(r, 70));
  assert.equal(capture.length, 2, "burst collapses to one trailing update");
  assert.equal(capture[1].params.message, "step 6", "trailing update is the latest");
  assert.equal(capture[1].params.progress, 6);
});

test("progress counter increases monotonically across all events", async () => {
  const { extra, capture } = fakeExtra();
  const bridge = createProgressBridge(extra, { throttleMs: 0 });

  for (let i = 0; i < 4; i += 1) {
    bridge.onProgress({ step: `step ${i}` });
    await new Promise((r) => setTimeout(r, 5));
  }

  assert.deepEqual(
    capture.map((c) => c.params.progress),
    [1, 2, 3, 4]
  );
});

test("finish flushes a coalesced trailing event", async () => {
  const { extra, capture } = fakeExtra();
  const bridge = createProgressBridge(extra, { throttleMs: 10_000 });

  bridge.onProgress({ step: "first" });
  bridge.onProgress({ step: "second" });
  await new Promise((r) => setImmediate(r));
  assert.equal(capture.length, 1);

  bridge.finish();
  await new Promise((r) => setImmediate(r));
  assert.equal(capture.length, 2);
  assert.equal(capture[1].params.message, "second");
});

test("a failing sendNotification never breaks the pipeline callback", async () => {
  const bridge = createProgressBridge(
    {
      _meta: { progressToken: "tok" },
      sendNotification: async () => {
        throw new Error("transport closed");
      },
    },
    { throttleMs: 0 }
  );

  assert.doesNotThrow(() => bridge.onProgress({ step: "still fine" }));
  await new Promise((r) => setImmediate(r));
  assert.equal(bridge.count, 1);
});
