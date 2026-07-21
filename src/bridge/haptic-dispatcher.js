export class HapticDispatcher {
  #client;
  #minimumIntervalMs;
  #aggregationWindowMs;
  #onSend;
  #lastSentAt = 0;
  #pending = null;
  #timer = null;
  #deferredIntents = new Map();

  constructor(client, { minimumIntervalMs = 30, aggregationWindowMs = 15, onSend = () => {} } = {}) {
    this.#client = client;
    this.#minimumIntervalMs = minimumIntervalMs;
    this.#aggregationWindowMs = aggregationWindowMs;
    this.#onSend = onSend;
  }

  dispatch(candidates) {
    const outcomeKeys = new Set(
      candidates
        .filter((candidate) => candidate.phase === "outcome" && candidate.correlationKey)
        .map((candidate) => candidate.correlationKey)
    );

    for (const correlationKey of outcomeKeys) {
      this.#cancelIntent(correlationKey);
    }

    for (const candidate of candidates) {
      if (candidate.phase === "intent" && candidate.correlationKey && candidate.deferMs > 0) {
        if (outcomeKeys.has(candidate.correlationKey)) {
          continue;
        }

        this.#deferIntent(candidate);
        continue;
      }

      this.#queue(candidate);
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
  }

  #queue(candidate) {
    if (!candidate) {
      return;
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

  #send(candidate) {
    const sent = this.#client.send(candidate.waveform);
    this.#lastSentAt = Date.now();
    if (sent !== false) {
      this.#onSend(candidate);
    }
  }
}
