import { readFile, watch, watchFile, unwatchFile } from "node:fs";
import path from "node:path";

export class EventFileSource {
  #path;
  #logger;
  #onSnapshot;
  #lastSequence = -1;
  #lastSession = null;
  #reading = false;
  #readAgain = false;
  #retryTimer = null;
  #watchRetryTimer = null;
  #directoryWatcher = null;
  #stopped = true;

  constructor(path, onSnapshot, { logger = console } = {}) {
    this.#path = path;
    this.#onSnapshot = onSnapshot;
    this.#logger = logger;
  }

  start() {
    this.#stopped = false;
    // Directory notifications normally arrive within a few milliseconds. Keep
    // stat polling as a slow watchdog because Windows may occasionally lose a
    // notification while a file is being replaced.
    this.#startDirectoryWatcher();
    watchFile(this.#path, { interval: 250, persistent: true }, () => this.#read());
    this.#read(true);
  }

  stop() {
    this.#stopped = true;
    unwatchFile(this.#path);
    clearTimeout(this.#retryTimer);
    clearTimeout(this.#watchRetryTimer);
    this.#directoryWatcher?.close();
    this.#directoryWatcher = null;
  }

  #read(suppressSnapshot = false) {
    if (this.#reading) {
      this.#readAgain = true;
      return;
    }

    this.#reading = true;
    readFile(this.#path, "utf8", (error, contents) => {
      this.#reading = false;

      if (this.#readAgain) {
        this.#readAgain = false;
        queueMicrotask(() => this.#read());
      }

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

  #startDirectoryWatcher() {
    if (this.#stopped || this.#directoryWatcher) {
      return;
    }

    const directory = path.dirname(this.#path);
    const filename = path.basename(this.#path).toLowerCase();

    try {
      const watcher = watch(directory, { persistent: true }, (_eventType, changedFilename) => {
        if (changedFilename === null || String(changedFilename).toLowerCase() === filename) {
          this.#read();
        }
      });

      watcher.on("error", (error) => {
        this.#logger.warn(`File notification watcher failed for ${directory}: ${error.message}`);
        watcher.close();
        if (this.#directoryWatcher === watcher) {
          this.#directoryWatcher = null;
        }
        this.#scheduleWatcherRetry();
      });

      this.#directoryWatcher = watcher;
    } catch {
      this.#scheduleWatcherRetry();
    }
  }

  #scheduleWatcherRetry() {
    if (this.#stopped || this.#watchRetryTimer) {
      return;
    }

    this.#watchRetryTimer = setTimeout(() => {
      this.#watchRetryTimer = null;
      this.#startDirectoryWatcher();
    }, 1_000);
  }
}
