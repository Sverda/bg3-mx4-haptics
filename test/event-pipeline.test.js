import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventRouter } from "../src/bridge/event-router.js";
import { HapticDispatcher } from "../src/bridge/haptic-dispatcher.js";

test("routes the sample area spell through the complete event pipeline", async () => {
  const snapshot = JSON.parse(await readFile(new URL("../samples/events.json", import.meta.url), "utf8"));
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

  dispatcher.dispatch(new EventRouter().routeSnapshot(snapshot));
  await new Promise((resolve) => setTimeout(resolve, 25));
  const areaResult = announced.find((candidate) => candidate.pattern?.name === "area-impact");
  dispatcher.stop();

  assert.equal(areaResult?.event.type, "attack.critical");
  assert.equal(areaResult?.pattern.pulses.length, 6);
  assert.equal(areaResult?.pattern.pulses.at(-1).waveform, "firework");
  assert.ok(sent.length >= 2);
});
