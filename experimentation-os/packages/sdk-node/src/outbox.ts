import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { EventOutbox, ExperimentEvent } from "./index.js";

export class FileEventOutbox implements EventOutbox {
  readonly #directory: string;

  constructor(directory: string) {
    this.#directory = directory;
  }

  async #ready(): Promise<void> {
    await mkdir(this.#directory, { recursive: true, mode: 0o700 });
  }

  #filename(eventId: string): string {
    return path.join(this.#directory, `${encodeURIComponent(eventId)}.json`);
  }

  async store(event: ExperimentEvent): Promise<void> {
    await this.#ready();
    const target = this.#filename(event.eventId);
    const temporary = path.join(this.#directory, `.${randomUUID()}.tmp`);
    await writeFile(temporary, JSON.stringify(event), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporary, target);
  }

  async pending(limit = 100): Promise<ExperimentEvent[]> {
    await this.#ready();
    const files = (await readdir(this.#directory))
      .filter((name) => name.endsWith(".json"))
      .sort()
      .slice(0, Math.max(0, limit));
    const events: ExperimentEvent[] = [];
    for (const file of files) {
      events.push(
        JSON.parse(
          await readFile(path.join(this.#directory, file), "utf8"),
        ) as ExperimentEvent,
      );
    }
    return events;
  }

  async remove(eventId: string): Promise<void> {
    await rm(this.#filename(eventId), { force: true });
  }
}
