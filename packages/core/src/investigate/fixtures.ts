import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type RepoFiles = Readonly<Record<string, string>>;

export async function writeFiles(root: string, files: RepoFiles): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }
}

export const SESSION_TTL_SECONDS = 3600;

export function brokenSessionProject(): RepoFiles {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "shop", version: "1.0.0", scripts: { test: "vitest" } }),
    "src/auth/login.ts": [
      'import { createSession } from "../session/store";',
      "",
      "export async function login(userId: string): Promise<string> {",
      "  return createSession(userId);",
      "}",
      "",
    ].join("\n"),
    "src/session/store.ts": [
      'import { redis } from "./redis-client";',
      "",
      `export const SESSION_TTL_SECONDS = ${SESSION_TTL_SECONDS};`,
      "",
      "export async function createSession(userId: string): Promise<string> {",
      "  const id = `sess:${userId}`;",
      "  await redis.set(id, userId, SESSION_TTL_SECONDS);",
      "  return id;",
      "}",
      "",
      "export async function refreshSession(id: string): Promise<void> {",
      "  const userId = await redis.get(id);",
      "  if (!userId) return;",
      "  await redis.set(id, userId, 1);",
      "}",
      "",
      "export async function validateSession(id: string): Promise<boolean> {",
      "  return (await redis.get(id)) !== null;",
      "}",
      "",
    ].join("\n"),
    "src/session/redis-client.ts": [
      "export interface RedisClient {",
      "  get(key: string): Promise<string | null>;",
      "  set(key: string, value: string, ttlSeconds: number): Promise<void>;",
      "}",
      "",
      "export const redis: RedisClient = {",
      "  async get() {",
      "    return null;",
      "  },",
      "  async set() {",
      "    return undefined;",
      "  },",
      "};",
      "",
    ].join("\n"),
    "src/session/middleware.ts": [
      'import { refreshSession, validateSession } from "./store";',
      "",
      "export async function requireSession(id: string): Promise<boolean> {",
      "  const valid = await validateSession(id);",
      "  if (valid) await refreshSession(id);",
      "  return valid;",
      "}",
      "",
    ].join("\n"),
    "src/session/store.test.ts": [
      'import { createSession } from "./store";',
      "",
      "export async function testsCreateSession(): Promise<string> {",
      '  return createSession("u1");',
      "}",
      "",
    ].join("\n"),
  };
  for (let index = 0; index < 40; index += 1) {
    files[`src/catalog/product-${index}.ts`] = [
      `export function product${index}(): number {`,
      `  return ${index};`,
      "}",
      "",
    ].join("\n");
  }
  return files;
}

export const QUESTIONS_ANSWER = JSON.stringify({
  questions: [
    { id: "D1", question: "How is a session created?", kind: "creation", expectedOutputs: ["the function that creates a session"] },
    { id: "D2", question: "How is a session persisted?", kind: "persistence", expectedOutputs: ["the store and its TTL"] },
    { id: "D3", question: "How is a session validated?", kind: "validation", expectedOutputs: ["the validation path"] },
    { id: "D4", question: "What causes a session to expire?", kind: "expiry", expectedOutputs: ["where the TTL is set"] },
    { id: "D5", question: "Is there a cache or database inconsistency?", kind: "consistency", expectedOutputs: ["any divergent writes"] },
    { id: "D6", question: "Are there tests reproducing the logout?", kind: "tests", expectedOutputs: ["test files covering sessions"] },
  ],
});

export const REFRESH_FINDING = JSON.stringify({
  finding: "refreshSession rewrites the session with a 1 second TTL instead of the configured one",
  hypothesis: "refreshSession resets the TTL to 1 second, so any refreshed session expires almost immediately",
  confidence: "high",
  evidence: [
    { file: "src/session/store.ts", symbol: "refreshSession", line: 13, detail: "redis.set(id, userId, 1)" },
    { file: "src/session/store.ts", symbol: "SESSION_TTL_SECONDS", line: 3, detail: "the configured TTL is 3600" },
  ],
});

export const MIDDLEWARE_FINDING = JSON.stringify({
  finding: "requireSession calls refreshSession on every validated request",
  hypothesis: "every authenticated request shortens the session",
  confidence: "medium",
  evidence: [{ file: "src/session/middleware.ts", symbol: "requireSession", line: 3 }, { file: "src/session/store.ts", symbol: "refreshSession" }],
});

export const CATALOG_FINDING = JSON.stringify({
  finding: "the catalog module exposes product helpers",
  confidence: "low",
  evidence: [{ file: "src/catalog/product-0.ts", symbol: "product0" }],
});
