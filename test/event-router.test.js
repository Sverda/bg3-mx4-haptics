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
    { id: "dealt-low", type: "attack.hit", magnitude: 7 },
    { id: "dealt-medium", type: "attack.hit", magnitude: 15 },
    { id: "dealt-high", type: "attack.hit", magnitude: 25 },
    { id: "received-low", type: "damage.received", magnitude: 4 },
    { id: "received-medium", type: "damage.received", magnitude: 12 },
    { id: "received-high", type: "damage.received", magnitude: 16 }
  ]));

  assert.deepEqual(
    result.map((item) => item.waveform),
    [
      "subtle_collision",
      "damp_collision",
      "sharp_collision",
      "subtle_collision",
      "damp_collision",
      "sharp_collision"
    ]
  );
});

test("marks attacks for intent/outcome coalescing by story action", () => {
  const router = new EventRouter();
  const [attack, healing] = router.routeSnapshot(snapshot(1, [
    {
      id: "attack",
      type: "action.confirmed",
      spell: "Projectile_MainHandAttack",
      spellType: "projectile",
      storyActionId: 42
    },
    {
      id: "healing",
      type: "action.confirmed",
      spell: "Target_HealingWord",
      spellType: "target",
      storyActionId: 43
    }
  ]));

  assert.equal(attack.phase, "intent");
  assert.equal(attack.correlationKey, "story-action:42");
  assert.equal(attack.deferMs, 2500);
  assert.equal(healing.phase, undefined);
  assert.equal(healing.waveform, "completed");
});

test("marks combat results with the same correlation key", () => {
  const router = new EventRouter();
  const [result] = router.routeSnapshot(snapshot(1, [
    { id: "hit", type: "attack.hit", magnitude: 8, storyActionId: 42 }
  ]));

  assert.equal(result.phase, "outcome");
  assert.equal(result.correlationKey, "story-action:42");
  assert.equal(result.waveform, "damp_collision");
});

test("rejects unsupported snapshots", () => {
  const router = new EventRouter();
  assert.throws(() => router.routeSnapshot({ version: 2, events: [] }), TypeError);
});
