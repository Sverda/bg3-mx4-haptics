const DEFAULT_MAPPINGS = Object.freeze({
  "action.confirmed": { waveform: "damp_state_change", priority: 20 },
  "attack.hit": { waveform: "damp_collision", priority: 50 },
  "attack.critical": { waveform: "firework", priority: 100 },
  "attack.missed": { waveform: "mad", priority: 60 },
  "character.killed": { waveform: "happy_alert", priority: 90 },
  "damage.received": { waveform: "damp_collision", priority: 80 },
  "roll.success": { waveform: "completed", priority: 70 },
  "roll.failure": { waveform: "angry_alert", priority: 70 },
  "turn.started": { waveform: "knock", priority: 40 }
});

const OUTCOME_TYPES = new Set([
  "attack.hit",
  "attack.critical",
  "attack.missed",
  "character.killed"
]);

export class EventRouter {
  #mappings;
  #seen = new Set();
  #seenOrder = [];

  constructor({ mappings = DEFAULT_MAPPINGS, seenLimit = 256 } = {}) {
    this.#mappings = mappings;
    this.seenLimit = seenLimit;
  }

  routeSnapshot(snapshot) {
    if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.events)) {
      throw new TypeError("Unsupported haptic event snapshot.");
    }

    const routed = [];
    for (const event of snapshot.events) {
      if (!event || typeof event.id !== "string" || this.#seen.has(event.id)) {
        continue;
      }

      this.#remember(event.id);
      const mapping = this.#mappings[event.type];
      if (!mapping) {
        continue;
      }

      const candidate = {
        ...mapping,
        event,
        waveform: this.#waveformForMagnitude(event, mapping.waveform)
      };

      const correlationKey = this.#correlationKey(event);
      if (correlationKey) {
        candidate.correlationKey = correlationKey;
      }

      if (event.type === "action.confirmed" && this.#expectsCombatOutcome(event)) {
        candidate.phase = "intent";
        candidate.deferMs = 2500;
      } else if (OUTCOME_TYPES.has(event.type)) {
        candidate.phase = "outcome";
      }

      routed.push(candidate);
    }

    return routed.sort((left, right) => right.priority - left.priority);
  }

  #waveformForMagnitude(event, fallback) {
    if (event.type !== "damage.received" && event.type !== "attack.hit") {
      return fallback;
    }

    const magnitude = Number(event.magnitude ?? 0);
    const strongThreshold = event.type === "damage.received" ? 16 : 25;
    const subtleThreshold = event.type === "damage.received" ? 4 : 7;

    if (magnitude >= strongThreshold) {
      return "sharp_collision";
    }

    if (magnitude > 0 && magnitude <= subtleThreshold) {
      return "subtle_collision";
    }

    return fallback;
  }

  #correlationKey(event) {
    if (event.storyActionId === undefined || event.storyActionId === null || event.storyActionId === "") {
      return null;
    }

    return `story-action:${event.storyActionId}`;
  }

  #expectsCombatOutcome(event) {
    if (!this.#correlationKey(event)) {
      return false;
    }

    const spellType = String(event.spellType ?? "").toLowerCase();
    return spellType === "projectile" || spellType === "zone";
  }

  #remember(id) {
    this.#seen.add(id);
    this.#seenOrder.push(id);

    while (this.#seenOrder.length > this.seenLimit) {
      this.#seen.delete(this.#seenOrder.shift());
    }
  }
}

export { DEFAULT_MAPPINGS };
