import type { Stack } from "../types.ts";

const LANGUAGE_BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: "TypeScript", tsx: "TypeScript", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript", cjs: "JavaScript",
  py: "Python", rs: "Rust", go: "Go", rb: "Ruby", java: "Java", kt: "Kotlin", swift: "Swift", sql: "SQL",
};

const FRAMEWORK_BY_PACKAGE: Readonly<Record<string, string>> = {
  react: "React", next: "Next.js", vite: "Vite", vue: "Vue", svelte: "Svelte", "@angular/core": "Angular",
  express: "Express", hono: "Hono", fastify: "Fastify", koa: "Koa", "@nestjs/core": "NestJS",
  "@tauri-apps/api": "Tauri", electron: "Electron", prisma: "Prisma", "@prisma/client": "Prisma",
  "drizzle-orm": "Drizzle", zod: "Zod", zustand: "Zustand", "@tanstack/react-query": "TanStack Query",
  tailwindcss: "Tailwind CSS", "better-sqlite3": "SQLite", pg: "PostgreSQL", redis: "Redis", ioredis: "Redis",
};

const MIN_FILES_FOR_LANGUAGE = 1;

export function stackOf(paths: readonly string[], dependencies: readonly string[], packageManager: string | null): Stack {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const language = LANGUAGE_BY_EXTENSION[path.split(".").at(-1) ?? ""];
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  const languages = [...counts].filter(([, count]) => count >= MIN_FILES_FOR_LANGUAGE).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([language]) => language);
  const frameworks = [...new Set(dependencies.flatMap((name) => FRAMEWORK_BY_PACKAGE[name] ?? []))].sort();
  return { languages, frameworks, packageManager };
}
