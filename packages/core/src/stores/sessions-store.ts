import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isNotFound } from "../shared/index.ts";

export class SessionStore {
  private readonly file: string;

  constructor(weaveDir: string) {
    this.file = join(weaveDir, "sessions.json");
  }

  private async readAll(): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(this.file, "utf8")) as Record<string, string>;
    } catch (error) {
      if (isNotFound(error)) return {};
      throw error;
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
