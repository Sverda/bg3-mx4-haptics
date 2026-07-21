import test from "node:test";
import assert from "node:assert/strict";
import { HapticDispatcher } from "../src/bridge/haptic-dispatcher.js";

test("keeps only the highest priority event during the cooldown", async () => {
  const sent = [];
  const client = { send: (waveform) => sent.push(waveform) };
  const dispatcher = new HapticDispatcher(client, { minimumIntervalMs: 20 });

  dispatcher.dispatch([{ waveform: "knock", priority: 40 }]);
  dispatcher.dispatch([{ waveform: "damp_collision", priority: 50 }]);
  dispatcher.dispatch([{ waveform: "firework", priority: 100 }]);

  await new Promise((resolve) => setTimeout(resolve, 35));
  dispatcher.stop();

  assert.deepEqual(sent, ["knock", "firework"]);
});
