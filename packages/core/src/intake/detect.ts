import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isNotFound } from "../shared/index.ts";
import type { PackageManager } from "./types.ts";

export interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export const ESLINT_CONFIGS = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
];

export const COMPOSE_FILES = [
  "docker-compose.yml",
  "docker-compose.yaml",
  "compose.yml",
  "compose.yaml",
];

const PLACEHOLDER_TEST_PATTERN = /no test specified/i;

export async function readPackageJson(cwd: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as PackageJson;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function detectPackageManager(cwd: string): PackageManager | null {
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(cwd, "yarn.lock"))) return "yarn";
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) return "bun";
  if (existsSync(join(cwd, "package-lock.json"))) return "npm";
  return existsSync(join(cwd, "package.json")) ? "npm" : null;
}

export function runScript(pm: PackageManager, script: string): string {
  return pm === "npm" ? `npm run --silent ${script}` : `${pm} run ${script}`;
}

export function isPlaceholderTest(command: string): boolean {
  return PLACEHOLDER_TEST_PATTERN.test(command);
}

export function localBin(cwd: string, name: string): string | null {
  const path = join(cwd, "node_modules", ".bin", name);
  return existsSync(path) ? path : null;
}

export function hasAnyFile(cwd: string, names: string[]): string | null {
  return names.find((name) => existsSync(join(cwd, name))) ?? null;
}

export async function readHead(cwd: string): Promise<string | null> {
  const { spawn } = await import("node:child_process");
  return new Promise((done) => {
    const child = spawn("git", ["rev-parse", "HEAD"], {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    child.on("error", () => done(null));
    child.on("close", (code) => done(code === 0 ? out.trim() : null));
  });
}
