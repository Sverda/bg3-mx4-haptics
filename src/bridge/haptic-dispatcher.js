import { createAreaPattern } from "./haptic-patterns.js";

const ACTION_PHASES = new Set(["outcome", "spell-complete"]);
const AREA_ACCENTS = new Set(["firework", "happy_alert", "mad", "ringing"]);

export class HapticDispatcher {
  #client;
  #minimumIntervalMs;
  #aggregationWindowMs;
  #actionQuietMs;
  #actionMaxWaitMs;
  #actionMemoryMs;
  #onSend;
  #lastSentAt = 0;
  #pending = null;
  #timer = null;
  #deferredIntents = new Map();
  #actionGroups = new Map();
  #actionMetadata = new Map();
  #finalizedActions = new Map();
  #activePattern = null;

  constructor(client, {
    minimumIntervalMs = 30,
    aggregationWindowMs = 15,
    actionQuietMs = 100,
    actionMaxWaitMs = 500,
    actionMemoryMs = 3_000,
    onSend = () => {}
  } = {}) {
    this.#client = client;
    this.#minimumIntervalMs = minimumIntervalMs;
    this.#aggregationWindowMs = aggregationWindowMs;
    this.#actionQuietMs = actionQuietMs;
    this.#actionMaxWaitMs = actionMaxWaitMs;
    this.#actionMemoryMs = actionMemoryMs;
    this.#onSend = onSend;
  }

  dispatch(candidates) {
    const now = Date.now();
    this.#purgeActionState(now);

    const failedKeys = new Set(
      candidates
        .filter((candidate) => candidate.phase === "spell-failed" && candidate.correlationKey)
        .map((candidate) => candidate.correlationKey)
    );

    for (const candidate of candidates) {
      if (candidate.phase === "spell-start" && candidate.correlationKey && !failedKeys.has(candidate.correlationKey)) {
        const event = candidate.event ?? {};
        this.#finalizedActions.delete(candidate.correlationKey);
        this.#actionMetadata.set(candidate.correlationKey, {
          areaRadius: Number(event.areaRadius) || 0,
          isArea: Boolean(event.isArea),
          expiresAt: now + 10_000
        });
      }
    }

    for (const correlationKey of failedKeys) {
      this.#cancelAction(correlationKey);
      this.#finalizedActions.set(correlationKey, {
        outcomeSeen: true,
        expiresAt: now + this.#actionMemoryMs
      });
    }

    const outcomeKeys = new Set(
      candidates
        .filter((candidate) => candidate.phase === "outcome" && candidate.correlationKey)
        .map((candidate) => candidate.correlationKey)
    );

    for (const correlationKey of outcomeKeys) {
      this.#cancelIntent(correlationKey);
    }

    for (const candidate of candidates) {
      if (candidate.phase === "spell-start" || candidate.phase === "spell-failed") {
        continue;
      }

      if (candidate.phase === "intent" && candidate.correlationKey && candidate.deferMs > 0) {
        if (outcomeKeys.has(candidate.correlationKey)) {
          continue;
        }

        this.#deferIntent(candidate);
        continue;
      }

      if (candidate.correlationKey && ACTION_PHASES.has(candidate.phase)) {
        if (this.#shouldSuppressActionCandidate(candidate)) {
          continue;
        }

        this.#groupActionCandidate(candidate, now);
        continue;
      }

      if (!candidate.silent) {
        this.#queue(candidate);
      }
    }
  }

  stop() {
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#pending = null;

    for (const { timer } of this.#deferredIntents.values()) {
      clearTimeout(timer);
    }
    this.#deferredIntents.clear();

    for (const group of this.#actionGroups.values()) {
      clearTimeout(group.timer);
    }
    this.#actionGroups.clear();
    this.#actionMetadata.clear();
    this.#finalizedActions.clear();
    this.#cancelPattern();
  }

  #groupActionCandidate(candidate, now) {
    const correlationKey = candidate.correlationKey;
    let group = this.#actionGroups.get(correlationKey);

    if (!group) {
      group = {
        candidates: [],
        startedAt: now,
        timer: null
      };
      this.#actionGroups.set(correlationKey, group);
    }

    const metadata = this.#actionMetadata.get(correlationKey);
    if (metadata) {
      candidate.areaRadius = metadata.areaRadius;
      candidate.isArea = metadata.isArea;
    } else {
      candidate.areaRadius = Number(candidate.event?.areaRadius) || 0;
      candidate.isArea = Boolean(candidate.event?.isArea);
    }

    group.candidates.push(candidate);
    clearTimeout(group.timer);

    const elapsed = now - group.startedAt;
    const remaining = Math.max(0, this.#actionMaxWaitMs - elapsed);
    group.timer = setTimeout(
      () => this.#finalizeAction(correlationKey),
      Math.min(this.#actionQuietMs, remaining)
    );
  }

  #finalizeAction(correlationKey) {
    const group = this.#actionGroups.get(correlationKey);
    if (!group) {
      return;
    }

    this.#actionGroups.delete(correlationKey);
    const outcomes = group.candidates.filter((candidate) => candidate.phase === "outcome");
    const candidates = outcomes.length > 0
      ? outcomes
      : group.candidates.filter((candidate) => candidate.phase === "spell-complete");

    if (candidates.length === 0) {
      return;
    }

    const selected = candidates.reduce((best, candidate) => (
      !best || candidate.priority > best.priority ? candidate : best
    ), null);

    const finalized = outcomes.length > 0
      ? this.#withAreaPattern(selected, group.candidates)
      : this.#withAreaPattern(selected, candidates);

    this.#finalizedActions.set(correlationKey, {
      outcomeSeen: outcomes.length > 0,
      expiresAt: Date.now() + this.#actionMemoryMs
    });
    this.#actionMetadata.delete(correlationKey);
    this.#queue(finalized);
  }

  #withAreaPattern(selected, candidates) {
    const targets = new Set(
      candidates
        .filter((candidate) => candidate.event?.direction !== "received")
        .map((candidate) => candidate.event?.target)
        .filter(Boolean)
    );
    const isArea = candidates.some((candidate) => candidate.isArea) || targets.size > 1;
    const isOutgoing = selected.event?.direction !== "received"
      && !String(selected.event?.type ?? "").startsWith("damage.received");

    if (!isArea || !isOutgoing) {
      return selected;
    }

    const areaRadius = Math.max(...candidates.map((candidate) => Number(candidate.areaRadius) || 0));
    const magnitude = Math.max(...candidates.map((candidate) => Number(candidate.event?.magnitude) || 0));
    const accentWaveform = AREA_ACCENTS.has(selected.waveform) ? selected.waveform : undefined;

    return {
      ...selected,
      pattern: createAreaPattern({
        seed: selected.event?.storyActionId ?? selected.event?.id ?? selected.correlationKey,
        targetCount: targets.size,
        areaRadius,
        magnitude,
        accentWaveform
      })
    };
  }

  #shouldSuppressActionCandidate(candidate) {
    const finalized = this.#finalizedActions.get(candidate.correlationKey);
    if (!finalized) {
      return false;
    }

    if (candidate.phase === "spell-complete") {
      return true;
    }

    return candidate.phase === "outcome" && finalized.outcomeSeen;
  }

  #queue(candidate) {
    if (!candidate) {
      return;
    }

    if (this.#activePattern) {
      if (candidate.priority <= this.#activePattern.priority) {
        return;
      }
      this.#cancelPattern();
    }

    if (!this.#pending || candidate.priority > this.#pending.priority) {
      this.#pending = candidate;
    }

    if (!this.#timer) {
      const elapsed = Date.now() - this.#lastSentAt;
      const cooldownRemaining = Math.max(0, this.#minimumIntervalMs - elapsed);
      this.#timer = setTimeout(() => {
        this.#timer = null;
        const pending = this.#pending;
        this.#pending = null;
        if (pending) {
          this.#send(pending);
        }
      }, Math.max(this.#aggregationWindowMs, cooldownRemaining));
    }
  }

  #deferIntent(candidate) {
    this.#cancelIntent(candidate.correlationKey);
    const timer = setTimeout(() => {
      this.#deferredIntents.delete(candidate.correlationKey);
      this.#queue(candidate);
    }, candidate.deferMs);
    this.#deferredIntents.set(candidate.correlationKey, { candidate, timer });
  }

  #cancelIntent(correlationKey) {
    const deferred = this.#deferredIntents.get(correlationKey);
    if (!deferred) {
      return;
    }

    clearTimeout(deferred.timer);
    this.#deferredIntents.delete(correlationKey);
  }

  #cancelAction(correlationKey) {
    this.#cancelIntent(correlationKey);
    const group = this.#actionGroups.get(correlationKey);
    if (group) {
      clearTimeout(group.timer);
      this.#actionGroups.delete(correlationKey);
    }
    this.#actionMetadata.delete(correlationKey);
  }

  #send(candidate) {
    if (candidate.pattern?.pulses?.length > 0) {
      this.#startPattern(candidate);
      return;
    }

    this.#sendWaveform(candidate.waveform, candidate, true);
  }

  #startPattern(candidate) {
    const pattern = {
      candidate,
      priority: candidate.priority,
      timers: []
    };
    this.#activePattern = pattern;
    let elapsed = 0;

    candidate.pattern.pulses.forEach((pulse, index) => {
      elapsed += pulse.delayMs;
      if (elapsed === 0) {
        this.#sendWaveform(pulse.waveform, candidate, index === 0);
        if (index === candidate.pattern.pulses.length - 1) {
          this.#activePattern = null;
        }
        return;
      }

      const timer = setTimeout(() => {
        if (this.#activePattern !== pattern) {
          return;
        }

        this.#sendWaveform(pulse.waveform, candidate, index === 0);
        if (index === candidate.pattern.pulses.length - 1) {
          this.#activePattern = null;
        }
      }, elapsed);
      pattern.timers.push(timer);
    });
  }

  #cancelPattern() {
    if (!this.#activePattern) {
      return;
    }

    for (const timer of this.#activePattern.timers) {
      clearTimeout(timer);
    }
    this.#activePattern = null;
  }

  #sendWaveform(waveform, candidate, notify) {
    const sent = this.#client.send(waveform);
    this.#lastSentAt = Date.now();
    if (notify && sent !== false) {
      this.#onSend(candidate);
    }
  }

  #purgeActionState(now) {
    for (const [correlationKey, metadata] of this.#actionMetadata) {
      if (metadata.expiresAt <= now) {
        this.#actionMetadata.delete(correlationKey);
      }
    }

    for (const [correlationKey, finalized] of this.#finalizedActions) {
      if (finalized.expiresAt <= now) {
        this.#finalizedActions.delete(correlationKey);
      }
    }
  }
}
