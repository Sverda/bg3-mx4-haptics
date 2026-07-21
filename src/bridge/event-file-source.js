import { readFile, watchFile, unwatchFile } from "node:fs";

export class EventFileSource {
  #path;
  #logger;
  #onSnapshot;
  #lastSequence = -1;
  #lastSession = null;
  #reading = false;
  #retryTimer = null;

  constructor(path, onSnapshot, { logger = console } = {}) {
    this.#path = path;
    this.#onSnapshot = onSnapshot;
    this.#logger = logger;
  }

  start() {
    watchFile(this.#path, { interval: 25, persistent: true }, () => this.#read());
    this.#read(true);
  }

  stop() {
    unwatchFile(this.#path);
    clearTimeout(this.#retryTimer);
  }

  #read(suppressSnapshot = false) {
    if (this.#reading) {
      return;
    }

    this.#reading = true;
    readFile(this.#path, "utf8", (error, contents) => {
      this.#reading = false;

      if (error) {
        if (error.code !== "ENOENT") {
          this.#logger.warn(`Could not read ${this.#path}: ${error.message}`);
        }
        return;
      }

      try {
        const snapshot = JSON.parse(contents);
        const session = typeof snapshot.session === "string" ? snapshot.session : "legacy";
        if (!Number.isInteger(snapshot.sequence)) {
          return;
        }

        if (session === this.#lastSession && snapshot.sequence <= this.#lastSequence) {
          return;
        }

        this.#lastSession = session;
        this.#lastSequence = snapshot.sequence;
        if (!suppressSnapshot) {
          this.#onSnapshot(snapshot);
        }
      } catch {
        clearTimeout(this.#retryTimer);
        this.#retryTimer = setTimeout(() => this.#read(suppressSnapshot), 20);
      }
    });
  }
}
