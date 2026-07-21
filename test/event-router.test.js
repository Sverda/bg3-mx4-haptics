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

test("uses spell type for intent/outcome coalescing without inspecting spell names", () => {
  const router = new EventRouter();
  const [projectile, attackName, healingName, movementName] = router.routeSnapshot(snapshot(1, [
    {
      id: "projectile",
      type: "action.confirmed",
      spell: "UnrelatedName",
      spellType: "projectile",
      storyActionId: 42
    },
    {
      id: "attack-name",
      type: "action.confirmed",
      spell: "Projectile_MainHandAttack",
      spellType: "target",
      storyActionId: 43
    },
    {
      id: "healing-name",
      type: "action.confirmed",
      spell: "Target_HealingWord",
      spellType: "target",
      storyActionId: 44
    },
    {
      id: "movement-name",
      type: "action.confirmed",
      spell: "Target_MistyStep",
      spellType: "target",
      storyActionId: 45
    }
  ]));

  assert.equal(projectile.phase, "intent");
  assert.equal(projectile.correlationKey, "story-action:42");
  assert.equal(projectile.deferMs, 2500);
  assert.equal(attackName.phase, undefined);
  assert.equal(attackName.waveform, "damp_state_change");
  assert.equal(healingName.waveform, "damp_state_change");
  assert.equal(movementName.waveform, "damp_state_change");
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

test("routes received critical damage above outgoing combat outcomes", () => {
  const router = new EventRouter();
  const result = router.routeSnapshot(snapshot(1, [
    { id: "critical", type: "attack.critical", storyActionId: 42 },
    { id: "received-critical", type: "damage.received.critical", storyActionId: 43 }
  ]));

  assert.deepEqual(result.map((item) => item.waveform), ["sharp_collision", "firework"]);
});

test("ignores zero damage and does not correlate non-positive story action ids", () => {
  const router = new EventRouter();
  const result = router.routeSnapshot(snapshot(1, [
    { id: "zero", type: "damage.received", magnitude: 0, storyActionId: 1 },
    { id: "hit", type: "attack.hit", magnitude: 5, storyActionId: 0 }
  ]));

  assert.equal(result.length, 1);
  assert.equal(result[0].correlationKey, undefined);
});

test("distinguishes dialogue rolls and their critical outcomes", () => {
  const router = new EventRouter();
  const result = router.routeSnapshot(snapshot(1, [
    { id: "success", type: "dialog.roll.success", criticality: "None" },
    { id: "critical-success", type: "dialog.roll.success", criticality: "CriticalSuccess" },
    { id: "failure", type: "dialog.roll.failure", criticality: "None" },
    { id: "critical-failure", type: "dialog.roll.failure", criticality: "CriticalFailure" }
  ]));

  assert.deepEqual(
    result.map((item) => item.waveform),
    ["completed", "jingle", "angry_alert", "mad"]
  );
});

test("routes offensive spell lifecycle without haptic feedback for its start or failure", () => {
  const router = new EventRouter();
  const result = router.routeSnapshot(snapshot(1, [
    { id: "start", type: "spell.offensive.started", storyActionId: 7, isArea: true },
    { id: "complete", type: "spell.offensive.completed", storyActionId: 7, isArea: true },
    { id: "failed", type: "spell.offensive.failed", storyActionId: 8 }
  ]));

  assert.deepEqual(result.map((item) => item.phase), ["spell-complete", "spell-start", "spell-failed"]);
  assert.equal(result[0].waveform, "ringing");
  assert.equal(result[1].silent, true);
  assert.equal(result[2].silent, true);
});

test("rejects unsupported snapshots", () => {
  const router = new EventRouter();
  assert.throws(() => router.routeSnapshot({ version: 2, events: [] }), TypeError);
});
