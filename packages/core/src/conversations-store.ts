import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ConversationMeta {
  id: string;
  /** First user message, truncated. Empty until the first turn lands. */
  title: string;
  createdAt: number;
  updatedAt: number;
}

const TITLE_MAX = 60;

/** First user message → a chat-list title. */
export function titleFromPrompt(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > TITLE_MAX
    ? oneLine.slice(0, TITLE_MAX - 1).trimEnd() + "…"
    : oneLine;
}

/**
 * The list of chats for one project. `.weave/` already lives inside the
 * project, so this file is project-scoped and holds a bare array.
 *
 * Like {@link SessionStore}, only ids + metadata are stored — the transcript
 * itself lives with the agent and `loadSession` replays it.
 */
export class ConversationStore {
  private readonly file: string;

  constructor(weaveDir: string) {
    this.file = join(weaveDir, "conversations.json");
  }

  async list(): Promise<ConversationMeta[]> {
    try {
      const parsed = JSON.parse(
        await readFile(this.file, "utf8"),
      ) as ConversationMeta[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async write(all: ConversationMeta[]): Promise<void> {
    await mkdir(join(this.file, ".."), { recursive: true });
    await writeFile(this.file, JSON.stringify(all, null, 2));
  }

  /** Insert the chat if new; otherwise bump `updatedAt` and fill an empty title. */
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
