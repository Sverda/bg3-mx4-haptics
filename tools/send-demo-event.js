import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const eventType = process.argv[2] ?? "attack.hit";
const magnitude = Number(process.argv[3] ?? 12);
const eventPath = path.resolve(process.argv[4] ?? "samples/live-events.json");

let snapshot;
try {
  snapshot = JSON.parse(await readFile(eventPath, "utf8"));
} catch {
  snapshot = { version: 1, session: `demo-${Date.now()}`, sequence: 0, events: [] };
}

snapshot.version = 1;
snapshot.session ??= `demo-${Date.now()}`;
snapshot.sequence = Number(snapshot.sequence ?? 0) + 1;
snapshot.events ??= [];
snapshot.events.push({
  id: `${snapshot.session}:${snapshot.sequence}`,
  type: eventType,
  magnitude,
  timestamp: Date.now()
});
snapshot.events = snapshot.events.slice(-16);

const temporaryPath = `${eventPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`);
await rename(temporaryPath, eventPath);
console.log(`Wrote ${eventType} (magnitude ${magnitude}) to ${eventPath}`);
