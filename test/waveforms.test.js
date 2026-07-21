import test from "node:test";
import assert from "node:assert/strict";
import { waveformIndex, WAVEFORMS } from "../src/bridge/waveforms.js";

test("waveform names map to the protocol byte", () => {
  assert.equal(waveformIndex("sharp_collision"), 0);
  assert.equal(waveformIndex("completed"), 7);
  assert.equal(waveformIndex("square"), 14);
  assert.equal(WAVEFORMS.length, 15);
});

test("invalid waveforms are rejected", () => {
  assert.throws(() => waveformIndex("unknown"), RangeError);
  assert.throws(() => waveformIndex(15), RangeError);
});
