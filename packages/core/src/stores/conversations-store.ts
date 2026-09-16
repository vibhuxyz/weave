import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isNotFound } from "../shared/index.ts";

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

const TITLE_MAX = 60;
const TITLE_ELLIPSIS = "…";

export function titleFromPrompt(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > TITLE_MAX
    ? oneLine.slice(0, TITLE_MAX - 1).trimEnd() + TITLE_ELLIPSIS
    : oneLine;
}

export class ConversationStore {
  private readonly file: string;

  constructor(weaveDir: string) {
    this.file = join(weaveDir, "conversations.json");
  }

  async list(): Promise<ConversationMeta[]> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.file, "utf8"));
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
    return Array.isArray(parsed) ? (parsed as ConversationMeta[]) : [];
  }

  private async write(all: ConversationMeta[]): Promise<void> {
    await mkdir(join(this.file, ".."), { recursive: true });
    await writeFile(this.file, JSON.stringify(all, null, 2));
  }

  async record(id: string, title: string): Promise<void> {
    const all = await this.list();
    const now = Date.now();
    const existing = all.find((c) => c.id === id);
    if (existing) {
      existing.updatedAt = now;
      if (!existing.title && title) existing.title = title;
    } else {
      all.push({ id, title, createdAt: now, updatedAt: now });
    }
    await this.write(all);
  }

  async touch(id: string): Promise<void> {
    const all = await this.list();
    const existing = all.find((c) => c.id === id);
    if (!existing) return;
    existing.updatedAt = Date.now();
    await this.write(all);
  }
}
