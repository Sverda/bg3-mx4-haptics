import test from "node:test";
import assert from "node:assert/strict";
import { HapticDispatcher } from "../src/bridge/haptic-dispatcher.js";

test("keeps only the highest priority event in a short burst", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 10,
    aggregationWindowMs: 10
  });

  dispatcher.dispatch([{ waveform: "knock", priority: 40 }]);
  dispatcher.dispatch([{ waveform: "damp_collision", priority: 50 }]);
  dispatcher.dispatch([{ waveform: "firework", priority: 100 }]);

  await new Promise((resolve) => setTimeout(resolve, 25));
  dispatcher.stop();

  assert.deepEqual(sent, ["firework"]);
});

test("cancels an attack intent when its outcome arrives", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 5,
    aggregationWindowMs: 5,
    actionQuietMs: 5,
    actionMaxWaitMs: 20
  });

  dispatcher.dispatch([{
    waveform: "damp_state_change",
    priority: 20,
    phase: "intent",
    correlationKey: "story-action:42",
    deferMs: 25
  }]);
  dispatcher.dispatch([{
    waveform: "damp_collision",
    priority: 50,
    phase: "outcome",
    correlationKey: "story-action:42"
  }]);

  await new Promise((resolve) => setTimeout(resolve, 40));
  dispatcher.stop();

  assert.deepEqual(sent, ["damp_collision"]);
});

test("suppresses an intent when the same batch already contains its outcome", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 5,
    aggregationWindowMs: 5,
    actionQuietMs: 5,
    actionMaxWaitMs: 20
  });

  dispatcher.dispatch([
    {
      waveform: "firework",
      priority: 100,
      phase: "outcome",
      correlationKey: "story-action:42"
    },
    {
      waveform: "damp_state_change",
      priority: 20,
      phase: "intent",
      correlationKey: "story-action:42",
      deferMs: 15
    }
  ]);

  await new Promise((resolve) => setTimeout(resolve, 35));
  dispatcher.stop();

  assert.deepEqual(sent, ["firework"]);
});

test("plays a deferred intent when no outcome arrives", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 5,
    aggregationWindowMs: 5
  });

  dispatcher.dispatch([{
    waveform: "damp_state_change",
    priority: 20,
    phase: "intent",
    correlationKey: "story-action:7",
    deferMs: 10
  }]);

  await new Promise((resolve) => setTimeout(resolve, 30));
  dispatcher.stop();

  assert.deepEqual(sent, ["damp_state_change"]);
});

test("reduces hit, critical and kill from one action to the strongest outcome", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 2,
    aggregationWindowMs: 2,
    actionQuietMs: 5,
    actionMaxWaitMs: 20
  });

  dispatcher.dispatch([
    {
      waveform: "damp_collision",
      priority: 50,
      phase: "outcome",
      correlationKey: "story-action:42",
      event: { id: "hit", type: "attack.hit", storyActionId: 42, target: "enemy" }
    },
    {
      waveform: "firework",
      priority: 100,
      phase: "outcome",
      correlationKey: "story-action:42",
      event: { id: "critical", type: "attack.critical", storyActionId: 42, target: "enemy" }
    },
    {
      waveform: "happy_alert",
      priority: 110,
      phase: "outcome",
      correlationKey: "story-action:42",
      event: { id: "kill", type: "character.killed", storyActionId: 42, target: "enemy" }
    }
  ]);

  await new Promise((resolve) => setTimeout(resolve, 25));
  dispatcher.stop();

  assert.deepEqual(sent, ["happy_alert"]);
});

test("suppresses a completed spell after its correlated combat outcome", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 2,
    aggregationWindowMs: 2,
    actionQuietMs: 5,
    actionMaxWaitMs: 20,
    actionMemoryMs: 100
  });

  dispatcher.dispatch([{
    waveform: "damp_collision",
    priority: 50,
    phase: "outcome",
    correlationKey: "story-action:8",
    event: { id: "hit", type: "attack.hit", storyActionId: 8, target: "enemy" }
  }]);
  await new Promise((resolve) => setTimeout(resolve, 15));
  dispatcher.dispatch([{
    waveform: "ringing",
    priority: 30,
    phase: "spell-complete",
    correlationKey: "story-action:8",
    event: { id: "complete", type: "spell.offensive.completed", storyActionId: 8 }
  }]);

  await new Promise((resolve) => setTimeout(resolve, 20));
  dispatcher.stop();

  assert.deepEqual(sent, ["damp_collision"]);
});

test("a failed spell cancels its pending completion without feedback", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 2,
    aggregationWindowMs: 2,
    actionQuietMs: 15,
    actionMaxWaitMs: 30
  });

  dispatcher.dispatch([{
    waveform: "ringing",
    priority: 30,
    phase: "spell-complete",
    correlationKey: "story-action:10",
    event: { id: "complete", type: "spell.offensive.completed", storyActionId: 10 }
  }]);
  dispatcher.dispatch([{
    priority: 0,
    silent: true,
    phase: "spell-failed",
    correlationKey: "story-action:10",
    event: { id: "failed", type: "spell.offensive.failed", storyActionId: 10 }
  }]);

  await new Promise((resolve) => setTimeout(resolve, 35));
  dispatcher.stop();

  assert.deepEqual(sent, []);
});

test("builds an area pattern from spell metadata and multiple targets", async () => {
  const sent = [];
  const announced = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 2,
    aggregationWindowMs: 2,
    actionQuietMs: 5,
    actionMaxWaitMs: 20,
    onSend: (candidate) => announced.push(candidate)
  });

  dispatcher.dispatch([{
    priority: 0,
    silent: true,
    phase: "spell-start",
    correlationKey: "story-action:9",
    event: {
      id: "start",
      type: "spell.offensive.started",
      storyActionId: 9,
      isArea: true,
      areaRadius: 6
    }
  }]);
  dispatcher.dispatch([
    {
      waveform: "damp_collision",
      priority: 50,
      phase: "outcome",
      correlationKey: "story-action:9",
      event: { id: "a", type: "attack.hit", storyActionId: 9, target: "a", magnitude: 12 }
    },
    {
      waveform: "damp_collision",
      priority: 50,
      phase: "outcome",
      correlationKey: "story-action:9",
      event: { id: "b", type: "attack.hit", storyActionId: 9, target: "b", magnitude: 10 }
    }
  ]);

  await new Promise((resolve) => setTimeout(resolve, 25));
  const pattern = announced[0]?.pattern;
  dispatcher.stop();

  assert.equal(pattern?.name, "area-impact");
  assert.equal(pattern?.pulses.length, 8);
  assert.equal(sent.length, 1);
});

test("plays every pulse in a composite pattern", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 1,
    aggregationWindowMs: 1
  });

  dispatcher.dispatch([{
    waveform: "subtle_collision",
    priority: 50,
    event: { id: "pattern", type: "attack.hit" },
    pattern: {
      name: "test",
      pulses: [
        { waveform: "subtle_collision", delayMs: 0 },
        { waveform: "damp_collision", delayMs: 2 },
        { waveform: "sharp_collision", delayMs: 2 }
      ]
    }
  }]);

  await new Promise((resolve) => setTimeout(resolve, 20));
  dispatcher.stop();

  assert.deepEqual(sent, ["subtle_collision", "damp_collision", "sharp_collision"]);
});

test("higher-priority feedback interrupts an active composite pattern", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, {
    minimumIntervalMs: 1,
    aggregationWindowMs: 1
  });

  dispatcher.dispatch([{
    waveform: "subtle_collision",
    priority: 50,
    event: { id: "pattern", type: "attack.hit" },
    pattern: {
      name: "test",
      pulses: [
        { waveform: "subtle_collision", delayMs: 0 },
        { waveform: "damp_collision", delayMs: 30 },
        { waveform: "damp_collision", delayMs: 30 }
      ]
    }
  }]);
  await new Promise((resolve) => setTimeout(resolve, 10));
  dispatcher.dispatch([{
    waveform: "sharp_collision",
    priority: 120,
    event: { id: "danger", type: "damage.received.critical" }
  }]);

  await new Promise((resolve) => setTimeout(resolve, 70));
  dispatcher.stop();

  assert.deepEqual(sent, ["subtle_collision", "sharp_collision"]);
});
