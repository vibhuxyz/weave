import type { Blueprint } from "../../blueprint/index.ts";
import { renderJavaScriptEntry } from "./javascript.ts";
import { renderTypeScriptEntry } from "./typescript.ts";

export type ContractLanguage = "typescript" | "javascript";

const TYPESCRIPT_STACK = /\b(typescript|ts|tsx|deno|bun)\b/i;

export function contractLanguageFor(stack: string): ContractLanguage {
  return TYPESCRIPT_STACK.test(stack) ? "typescript" : "javascript";
}

export function renderContractEntry(blueprint: Blueprint, version: number, language: ContractLanguage): string {
  return language === "typescript" ? renderTypeScriptEntry(blueprint, version) : renderJavaScriptEntry(blueprint, version);
}
