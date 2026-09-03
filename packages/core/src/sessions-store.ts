import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Which conversation belongs to which project.
 *
 * Only a sessionId is stored: the transcript itself lives with the agent, and
 * `loadSession` replays it. IMPORTANT — record an id only AFTER a turn
 * completes. The agent writes a session to disk on first content, so storing
 * at creation time makes the next resume fail with "Resource not found" and
 * silently start over.
 */
export class SessionStore {
  private readonly file: string;

  constructor(weaveDir: string) {
    this.file = join(weaveDir, "sessions.json");
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  async get(projectDir: string): Promise<string | null> {
    return (await this.readAll())[projectDir] ?? null;
  }

  async set(projectDir: string, sessionId: string): Promise<void> {
    const all = await this.readAll();
    all[projectDir] = sessionId;
    await mkdir(join(this.file, ".."), { recursive: true });
    await writeFile(this.file, JSON.stringify(all, null, 2));
  }
}
