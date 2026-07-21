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

## Event mapping

| Event | Source | Default waveform |
| --- | --- | --- |
| `action.confirmed` | `UsingSpell` | Contextual state change; support uses `completed`, movement uses `wave` |
| `attack.hit` | `AttackedBy` with a player-controlled attacker | Collision selected by damage |
| `attack.critical` | `CriticalHitBy` | `firework` |
| `attack.missed` | `MissedBy` | `mad` |
| `character.killed` | `KilledBy` | `happy_alert` |
| `damage.received` | `AttackedBy` with a player-controlled defender | Collision selected by damage |
| `roll.success` | `RollResult` or `DialogRollResult` | `completed` |
| `roll.failure` | `RollResult` or `DialogRollResult` | `angry_alert` |
| `turn.started` | `TurnStarted` | `knock` |

The Haptic Web Plugin exposes discrete waveform presets rather than an arbitrary amplitude value. Damage strength is therefore represented with three collision waveforms:

| Damage event | Subtle | Medium | Strong |
| --- | --- | --- | --- |
| Dealt (`attack.hit`) | 1-7 damage | 8-24 damage | 25+ damage |
| Received (`damage.received`) | 1-4 damage | 5-15 damage | 16+ damage |

Received damage reaches the stronger waveform sooner so that danger remains distinct from attacks dealt by the player.

## Coalescing combat feedback

`action.confirmed` and its later combat result carry the same `storyActionId`. Attack-like actions are held for up to 2.5 seconds. If a matching hit, critical hit, miss or kill arrives during that window, the action pulse is discarded and only the result is played. If BG3 produces no result, the held action pulse is played as a fallback.

Events arriving within an 80 ms burst are aggregated and only the highest-priority waveform is sent. This prevents a hit and critical-hit notification from becoming two nearly simultaneous pulses.

The current Lua prototype emits events for player-controlled characters, including recruited companions and summons. In multiplayer, all locally observed player-controlled characters currently share one haptic stream; per-client routing can be added later.
