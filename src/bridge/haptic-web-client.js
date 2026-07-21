import { waveformIndex, WAVEFORMS } from "./waveforms.js";

const OPEN = 1;

export class HapticWebClient {
  #url;
  #logger;
  #socket = null;
  #connectPromise = null;
  #reconnectTimer = null;
  #reconnectAttempt = 0;
  #stopped = true;

  constructor({
    url = "wss://local.jmw.nz:41443/ws",
    logger = console
  } = {}) {
    if (typeof globalThis.WebSocket !== "function") {
      throw new Error("This bridge requires Node.js 22 or newer with the built-in WebSocket client.");
    }

    this.#url = url;
    this.#logger = logger;
  }

  get connected() {
    return this.#socket?.readyState === OPEN;
  }

  async start({ timeoutMs = 5_000 } = {}) {
    this.#stopped = false;
    return this.#connect(timeoutMs);
  }

  stop() {
    this.#stopped = true;
    clearTimeout(this.#reconnectTimer);
    this.#reconnectTimer = null;
    this.#connectPromise = null;

    if (this.#socket) {
      this.#socket.close();
      this.#socket = null;
    }
  }

  send(waveform) {
    const index = waveformIndex(waveform);

    if (!this.connected) {
      if (!this.#stopped) {
        void this.#connect().catch(() => {});
      }

      return false;
    }

    this.#socket.send(Uint8Array.of(index));
    return true;
  }

  async #connect(timeoutMs = 5_000) {
    if (this.connected) {
      return;
    }

    if (this.#connectPromise) {
      return this.#connectPromise;
    }

    this.#connectPromise = new Promise((resolve, reject) => {
      const socket = new WebSocket(this.#url);
      this.#socket = socket;

      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error(`Timed out connecting to ${this.#url}`));
      }, timeoutMs);

      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        this.#reconnectAttempt = 0;
        this.#logger.info(`Connected to Haptic Web Plugin (${this.#url}).`);
        resolve();
      }, { once: true });

      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error(`Could not connect to Haptic Web Plugin at ${this.#url}.`));
      }, { once: true });

      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        if (this.#socket === socket) {
          this.#socket = null;
        }

        if (!this.#stopped) {
          this.#scheduleReconnect();
        }
      });
    }).finally(() => {
      this.#connectPromise = null;
    });

    return this.#connectPromise;
  }

  #scheduleReconnect() {
    if (this.#reconnectTimer) {
      return;
    }

    const delayMs = Math.min(10_000, 250 * 2 ** this.#reconnectAttempt++);
    this.#logger.warn(`Haptic Web Plugin disconnected; retrying in ${delayMs} ms.`);
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      void this.#connect().catch((error) => {
        this.#logger.warn(error.message);
      });
    }, delayMs);
  }
}

export { WAVEFORMS };
