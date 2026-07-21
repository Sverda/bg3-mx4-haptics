import test from "node:test";
import assert from "node:assert/strict";
import { EventRouter } from "../src/bridge/event-router.js";

function snapshot(sequence, events) {
  return { version: 1, sequence, events };
}

test("routes known events by priority and ignores unknown events", () => {
  const router = new EventRouter();
  const result = router.routeSnapshot(snapshot(1, [
    { id: "1", type: "turn.started" },
    { id: "2", type: "not.mapped" },
    { id: "3", type: "attack.critical" }
  ]));

  assert.deepEqual(result.map((item) => item.waveform), ["firework", "knock"]);
});

test("does not route the same event twice from the rolling snapshot", () => {
  const router = new EventRouter();
  const event = { id: "session:1", type: "roll.success" };

  assert.equal(router.routeSnapshot(snapshot(1, [event])).length, 1);
  assert.equal(router.routeSnapshot(snapshot(2, [event])).length, 0);
});

test("selects collision strength from damage magnitude", () => {
  const router = new EventRouter();
  const result = router.routeSnapshot(snapshot(1, [
    { id: "low", type: "damage.received", magnitude: 3 },
    { id: "medium", type: "damage.received", magnitude: 15 },
    { id: "high", type: "damage.received", magnitude: 40 }
  ]));

  assert.deepEqual(
    result.map((item) => item.waveform),
    ["subtle_collision", "damp_collision", "sharp_collision"]
  );
});

test("rejects unsupported snapshots", () => {
  const router = new EventRouter();
  assert.throws(() => router.routeSnapshot({ version: 2, events: [] }), TypeError);
});
