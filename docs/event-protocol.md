# Event protocol

The BG3 Script Extender mod and the bridge communicate through a small rolling JSON snapshot. The default file is:

```text
%LOCALAPPDATA%\Larian Studios\Baldur's Gate 3\Script Extender\BG3Haptics\events.json
```

Client-side UI events use a second rolling snapshot in the same directory:

```text
%LOCALAPPDATA%\Larian Studios\Baldur's Gate 3\Script Extender\BG3Haptics\ui-events.json
```

The UI snapshot retains its latest 16 events and has an independent client session ID.

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
- `events` retains the latest 64 events so dense multi-target actions survive a short read delay.
- `id` is globally unique for the game session and is used for deduplication.
- Existing snapshots seed deduplication when the bridge starts and are not replayed.
- Extra event-specific fields are allowed and ignored by older bridge versions.
- Positive `storyActionId` values correlate spell lifecycle and combat-result events.
- `direction` is `dealt` or `received` for combat feedback.
- `target` identifies distinct targets when aggregating an area action.

## Event mapping

| Event | Source | Default waveform |
| --- | --- | --- |
| `attack.hit` | `AttackedBy` with a player-controlled attacker | Collision selected by damage |
| `attack.critical` | `CriticalHitBy` with a player-controlled attacker | `firework` |
| `attack.missed` | `MissedBy` | `mad` |
| `character.killed` | `KilledBy` | `happy_alert` |
| `damage.received` | `AttackedBy` with a player-controlled defender | Collision selected by damage |
| `damage.received.critical` | `CriticalHitBy` with a player-controlled defender | `sharp_collision` |
| `dialog.roll.success` | `DialogRollResult` | `completed`, or `jingle` when critical |
| `dialog.roll.failure` | `DialogRollResult` | `angry_alert`, or `mad` when critical |
| `roll.success` | `RollResult` | `completed` |
| `roll.failure` | `RollResult` | `angry_alert` |
| `spell.offensive.started` | harmful spell `UsingSpell` | Silent lifecycle event |
| `spell.offensive.completed` | harmful spell `CastedSpell` | `ringing` fallback or area pattern |
| `spell.offensive.failed` | harmful spell `CastSpellFailed` | Silent cancellation event |
| `turn.started` | `TurnStarted` | `knock` |
| `ui.hover` | Noesis `PreviewMouseMove` entering an interactive control | `subtle_collision` |
| `ui.focus` | Noesis `GotKeyboardFocus` | `subtle_collision` |
| `ui.activate` | Noesis mouse or keyboard/controller activation | `damp_state_change` |
| `ui.back` | Noesis keyboard/controller cancel | `subtle_collision` |

`action.confirmed` remains understood by the bridge for compatibility with older mod snapshots, but the current mod no longer emits it. Starting an action alone does not produce feedback.

UI events are emitted locally by `BootstrapClient.lua`. Hover, focus, activation and
back events have separate 60 ms, 70 ms, 50 ms and 100 ms cooldowns so rapid navigation
remains responsive without flooding the mouse. Mouse hover and activation are limited
to interactive Noesis controls such as buttons, toggles, sliders, tabs and list items.

The Haptic Web Plugin exposes discrete waveform presets rather than an arbitrary amplitude value. Damage strength is therefore represented with three collision waveforms:

| Damage event | Subtle | Medium | Strong |
| --- | --- | --- | --- |
| Dealt (`attack.hit`) | 1-7 damage | 8-24 damage | 25+ damage |
| Received (`damage.received`) | 1-4 damage | 5-15 damage | 16+ damage |

Received damage reaches the stronger waveform sooner so that danger remains distinct from attacks dealt by the player.
Zero-damage `AttackedBy` events are ignored.

## Offensive spells

A spell must have both the `IsSpell` and `IsHarmful` spell flags to enter the offensive-spell lifecycle. This excludes healing, movement, utility actions and non-magical attacks even though BG3 represents many of those actions through spell data internally.

`UsingSpell` only emits `spell.offensive.started` and never produces immediate feedback. A failed cast clears the pending action. A successful cast produces `spell.offensive.completed`, but that fallback is suppressed when a correlated hit, critical hit, miss or kill already represents the result.

## Coalescing combat feedback

Candidates with the same positive `storyActionId` are collected until no new result arrives for 100 ms, with a maximum wait of 500 ms. The bridge then selects one semantic result:

```text
received critical > kill > outgoing critical > received damage > miss > hit > spell completion
```

This prevents one attack from producing separate hit, critical-hit and kill notifications. Completed action keys are retained for three seconds so a late `CastedSpell` cannot add a second pulse.

## Area patterns

An action is treated as an area action when its spell metadata has a positive `AreaRadius`, uses an inherently area-shaped spell type, or produces results for more than one distinct target.

Area feedback contains 4-12 collision pulses. The count grows with radius and target count, while the collision strength follows the greatest damage result. Gaps are deterministically generated from `storyActionId` in the 50-100 ms range, so a pattern feels irregular but remains repeatable in tests. A miss, critical hit, kill or result-less offensive cast places its semantic waveform at the end of the sequence.

An active pattern is interrupted when a higher-priority event, such as received critical damage, arrives. Lower-priority feedback is discarded while the pattern is playing to prevent overlapping presets.

Events arriving within a 15 ms burst are aggregated and only the highest-priority waveform is sent. This prevents a hit and critical-hit notification from becoming two nearly simultaneous pulses without adding a perceptible delay to every event.

The current Lua prototype emits events for player-controlled characters, including recruited companions and summons. In multiplayer, all locally observed player-controlled characters currently share one haptic stream; per-client routing can be added later.
