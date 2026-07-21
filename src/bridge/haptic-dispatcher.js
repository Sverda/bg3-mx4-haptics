export class HapticDispatcher {
  #client;
  #minimumIntervalMs;
  #lastSentAt = 0;
  #pending = null;
  #timer = null;

  constructor(client, { minimumIntervalMs = 70 } = {}) {
    this.#client = client;
    this.#minimumIntervalMs = minimumIntervalMs;
  }

  dispatch(candidates) {
    const candidate = candidates[0];
    if (!candidate) {
      return;
    }

    const elapsed = Date.now() - this.#lastSentAt;
    if (elapsed >= this.#minimumIntervalMs) {
      this.#send(candidate);
      return;
    }

    if (!this.#pending || candidate.priority > this.#pending.priority) {
      this.#pending = candidate;
    }

    if (!this.#timer) {
      this.#timer = setTimeout(() => {
        this.#timer = null;
        const pending = this.#pending;
        this.#pending = null;
        if (pending) {
          this.#send(pending);
        }
      }, this.#minimumIntervalMs - elapsed);
    }
  }

  stop() {
    clearTimeout(this.#timer);
    this.#pending = null;
  }

  #send(candidate) {
    this.#client.send(candidate.waveform);
    this.#lastSentAt = Date.now();
  }
}
