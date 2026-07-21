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
    aggregationWindowMs: 5
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
    aggregationWindowMs: 5
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
