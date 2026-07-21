import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventFileSource } from "../src/bridge/event-file-source.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("uses an existing snapshot as a baseline and emits later changes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bg3-haptics-"));
  const eventPath = path.join(directory, "events.json");
  const received = [];

  try {
    await writeFile(eventPath, JSON.stringify({
      version: 1,
      session: "one",
      sequence: 1,
      events: [{ id: "one:1", type: "turn.started" }]
    }));

    const source = new EventFileSource(eventPath, (snapshot) => received.push(snapshot));
    source.start();
    await wait(70);

    assert.equal(received.length, 0);

    await writeFile(eventPath, JSON.stringify({
      version: 1,
      session: "one",
      sequence: 2,
      events: [{ id: "one:2", type: "roll.success" }]
    }));
    await wait(100);
    source.stop();

    assert.deepEqual(received.map((snapshot) => snapshot.sequence), [2]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("accepts a lower sequence number after the game session changes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "bg3-haptics-"));
  const eventPath = path.join(directory, "events.json");
  const received = [];

  try {
    await writeFile(eventPath, JSON.stringify({ version: 1, session: "old", sequence: 50, events: [] }));
    const source = new EventFileSource(eventPath, (snapshot) => received.push(snapshot));
    source.start();
    await wait(70);

    await writeFile(eventPath, JSON.stringify({ version: 1, session: "new", sequence: 0, events: [] }));
    await wait(100);
    source.stop();

    assert.deepEqual(received.map((snapshot) => snapshot.session), ["new"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
