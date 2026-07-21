# BG3 MX Master 4 Haptics

Prototype haptic feedback for Baldur's Gate 3 using the Logitech MX Master 4 and the Haptic Web Plugin.

## Current status

- The bridge connects to the Haptic Web Plugin over its low-latency WebSocket API.
- A real `subtle_collision` waveform has been sent successfully from this repository.
- The BG3 Script Extender mod emits combat, roll, spell and turn events.
- The event bridge deduplicates rolling snapshots, reconnects automatically and rate-limits overlapping feedback.
- The Lua mod has not yet been installed into the local BG3 installation.

## Requirements

- Logitech MX Master 4
- Logi Options+ with Haptic Web Plugin enabled
- Node.js 22 or newer
- Baldur's Gate 3 Script Extender v31 or newer for gameplay events

The bridge deliberately uses Node's built-in WebSocket implementation. On the development machine, browser and Node TLS clients connect successfully, while Windows Schannel clients currently fail before the TLS handshake.

## Test the mouse

```powershell
npm run haptic:test
```

This sends one `subtle_collision` waveform and exits.

## Run the bridge

```powershell
npm start
```

By default it watches:

```text
%LOCALAPPDATA%\Larian Studios\Baldur's Gate 3\Script Extender\BG3Haptics\events.json
```

The path can be overridden:

```powershell
npm start -- --events samples/live-events.json
```

In another terminal, emit a synthetic event:

```powershell
npm run demo -- attack.critical 50
```

## Install the development mod

The source mod is in `mod/Mods/BG3MX4Haptics`.

1. Install BG3 Script Extender v31 or newer.
2. Copy `mod/Mods/BG3MX4Haptics` to `<Baldur's Gate 3>\Data\Mods\BG3MX4Haptics`.
3. Open BG3 Mod Manager, refresh, add **BG3 MX4 Haptics** to the active load order and save it.
4. Start the bridge before loading a save.

The prototype only observes game events and writes a JSON file; it does not modify gameplay data or persistent save variables.

## Project layout

```text
src/bridge/     Node bridge and haptic routing
mod/            BG3 Script Extender mod source
test/           Unit tests
tools/          Development event generator
samples/        Example event snapshots
docs/           Protocol documentation
```

## Verification

```powershell
npm test
```

See [the event protocol](docs/event-protocol.md) for the current event and waveform mapping.
