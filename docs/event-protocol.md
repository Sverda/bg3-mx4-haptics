# Event protocol

The BG3 Script Extender mod and the bridge communicate through a small rolling JSON snapshot. The default file is:

```text
%LOCALAPPDATA%\Larian Studios\Baldur's Gate 3\Script Extender\BG3Haptics\events.json
```

Example:

```json
{
  "version": 1,
  "session": "1712345678-12345",
  "sequence": 2,
  "events": [
    {
      "id": "1712345678-12345:2",
      "type": "attack.hit",
      "magnitude": 12,
      "timestamp": 123456
    }
  ]
}
```

- `session` changes whenever BG3 loads a new session.
- `sequence` increases for every emitted event within a session.
- `events` retains the latest 16 events so a short read delay does not lose an event.
- `id` is globally unique for the game session and is used for deduplication.
- Extra event-specific fields are allowed and ignored by older bridge versions.

## Events in the first prototype

| Event | Source | Default waveform |
| --- | --- | --- |
| `action.confirmed` | `UsingSpell` | `sharp_state_change` |
| `attack.hit` | `AttackedBy` with a player-controlled attacker | Collision selected by damage |
| `attack.critical` | `CriticalHitBy` | `firework` |
| `attack.missed` | `MissedBy` | `mad` |
| `character.killed` | `KilledBy` | `happy_alert` |
| `damage.received` | `AttackedBy` with a player-controlled defender | Collision selected by damage |
| `roll.success` | `RollResult` or `DialogRollResult` | `completed` |
| `roll.failure` | `RollResult` or `DialogRollResult` | `angry_alert` |
| `turn.started` | `TurnStarted` | `knock` |

The current Lua prototype emits events for player-controlled characters, including recruited companions and summons. In multiplayer, all locally observed player-controlled characters currently share one haptic stream; per-client routing can be added later.
