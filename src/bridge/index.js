import path from "node:path";
import process from "node:process";
import { EventFileSource } from "./event-file-source.js";
import { EventRouter } from "./event-router.js";
import { HapticDispatcher } from "./haptic-dispatcher.js";
import { HapticWebClient, WAVEFORMS } from "./haptic-web-client.js";

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--waveform") {
      options.waveform = arguments_[++index];
    } else if (argument === "--events") {
      options.eventsPath = arguments_[++index];
    } else if (argument === "--url") {
      options.url = arguments_[++index];
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function defaultEventsPath() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error("LOCALAPPDATA is not set; pass --events explicitly.");
  }

  return path.join(
    localAppData,
    "Larian Studios",
    "Baldur's Gate 3",
    "Script Extender",
    "BG3Haptics",
    "events.json"
  );
}

function printHelp() {
  console.log(`BG3 MX Master 4 Haptics Bridge

Usage:
  npm start                         Watch the default BG3SE event file
  npm start -- --events <path>      Watch a custom event file
  npm start -- --waveform <name>    Play one waveform and exit

Available waveforms:
  ${WAVEFORMS.join("\n  ")}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const client = new HapticWebClient({ url: options.url });
  await client.start();

  if (options.waveform) {
    if (!client.send(options.waveform)) {
      throw new Error("Haptic Web Plugin is not connected.");
    }

    console.log(`Sent waveform: ${options.waveform}`);
    await new Promise((resolve) => setTimeout(resolve, 150));
    client.stop();
    return;
  }

  const eventsPath = options.eventsPath ?? process.env.BG3_HAPTICS_EVENT_FILE ?? defaultEventsPath();
  const router = new EventRouter();
  const dispatcher = new HapticDispatcher(client);
  const source = new EventFileSource(eventsPath, (snapshot) => {
    const candidates = router.routeSnapshot(snapshot);
    if (candidates[0]) {
      console.log(`Event ${candidates[0].event.type} -> ${candidates[0].waveform}`);
    }
    dispatcher.dispatch(candidates);
  });

  console.log(`Watching BG3 haptic events at: ${eventsPath}`);
  source.start();

  const shutdown = () => {
    source.stop();
    dispatcher.stop();
    client.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
