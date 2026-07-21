import test from "node:test";
import assert from "node:assert/strict";
import { createAreaPattern } from "../src/bridge/haptic-patterns.js";

test("area patterns are deterministic for a story action", () => {
  const options = {
    seed: 42,
    targetCount: 3,
    areaRadius: 4,
    magnitude: 18,
    accentWaveform: "firework"
  };

  const first = createAreaPattern(options);
  const second = createAreaPattern(options);

  assert.deepEqual(first, second);
  assert.equal(first.pulses.length, 6);
  assert.equal(first.pulses.at(-1).waveform, "firework");
  assert.ok(first.pulses.slice(1).every((pulse) => pulse.delayMs >= 50 && pulse.delayMs <= 100));
});

test("area patterns cap very large effects at twelve pulses", () => {
  const pattern = createAreaPattern({
    seed: 7,
    targetCount: 30,
    areaRadius: 20,
    magnitude: 100
  });

  assert.equal(pattern.pulses.length, 12);
});
