const DEFAULT_MAPPINGS = Object.freeze({
  "action.confirmed": { waveform: "sharp_state_change", priority: 20 },
  "attack.hit": { waveform: "damp_collision", priority: 50 },
  "attack.critical": { waveform: "firework", priority: 100 },
  "attack.missed": { waveform: "mad", priority: 60 },
  "character.killed": { waveform: "happy_alert", priority: 90 },
  "damage.received": { waveform: "damp_collision", priority: 80 },
  "roll.success": { waveform: "completed", priority: 70 },
  "roll.failure": { waveform: "angry_alert", priority: 70 },
  "turn.started": { waveform: "knock", priority: 40 }
});

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

      routed.push({
        ...mapping,
        event,
        waveform: this.#waveformForMagnitude(event, mapping.waveform)
      });
    }

    return routed.sort((left, right) => right.priority - left.priority);
  }

  #waveformForMagnitude(event, fallback) {
    if (event.type !== "damage.received" && event.type !== "attack.hit") {
      return fallback;
    }

    const magnitude = Number(event.magnitude ?? 0);
    if (magnitude >= 30) {
      return "sharp_collision";
    }

    if (magnitude > 0 && magnitude <= 8) {
      return "subtle_collision";
    }

    return fallback;
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
