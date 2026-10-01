import { existsSync } from "node:fs";
import { Transform, type Readable } from "node:stream";
import type { AuthMethod } from "@weave/protocol";
import { getEngine, grokCliPath, resolveEngineEntry } from "./engines.ts";

const GROK_SKILL_RELOAD_ID = "skills-reload";

const GROK_ON_PATH = process.platform === "win32" ? "grok.exe" : "grok";

function resolveGrokCliEntry(packageEntry: string | null): string {
  const canonical = grokCliPath();
  if (canonical) return canonical;
  if (packageEntry && existsSync(packageEntry)) return packageEntry;
  return GROK_ON_PATH;
}

export function requireGrokCliEntry(packageEntry: string | null, installHint: string): string {
  const entry = resolveGrokCliEntry(packageEntry);
  if (entry === GROK_ON_PATH) {
    throw new Error(`Grok is not installed (@xai-official/grok).${installHint}`);
  }
  return entry;
}

function packageGrokEntry(): string | null {
  try {
    return resolveEngineEntry(getEngine("grok"));
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}

interface GrokLoginMethod {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly command: string;
  readonly args: readonly string[];
}

function grokLoginMethod(method: GrokLoginMethod): AuthMethod {
  return {
    id: method.id,
    name: method.name,
    type: "terminal",
    description: method.description,
    _meta: {
      "terminal-auth": { command: method.command, args: [...method.args], label: method.name },
    },
  } as unknown as AuthMethod;
}

function isUnsolicitedGrokSkillReload(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return false;
  try {
    const message: unknown = JSON.parse(trimmed);
    if (typeof message !== "object" || message === null) return false;
    if (!("id" in message)) return false;
    return message.id === GROK_SKILL_RELOAD_ID && !("method" in message);
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

export function dropUnsolicitedGrokResponses(stdout: Readable): Readable {
  let pending = "";
  return stdout.pipe(
    new Transform({
      transform(chunk: Buffer | string, _encoding, callback) {
        pending += typeof chunk === "string" ? chunk : chunk.toString("utf8");
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        const kept = lines.filter((line) => !isUnsolicitedGrokSkillReload(line));
        callback(null, kept.length === 0 ? "" : `${kept.join("\n")}\n`);
      },
      flush(callback) {
        callback(null, pending.length > 0 && !isUnsolicitedGrokSkillReload(pending) ? pending : undefined);
      },
    }),
  );
}

export function grokTerminalAuthMethods(): AuthMethod[] {
  const command = resolveGrokCliEntry(packageGrokEntry());
  return [
    grokLoginMethod({
      id: "grok-device-auth",
      name: "Sign in with a device code",
      description: "Sign in with a one-time code. Works when this machine cannot open a browser.",
      command,
      args: ["login", "--device-auth"],
    }),
    grokLoginMethod({
      id: "grok-login",
      name: "Sign in with Grok",
      description: "Opens a browser to sign in to Grok.",
      command,
      args: ["login"],
    }),
  ];
}
