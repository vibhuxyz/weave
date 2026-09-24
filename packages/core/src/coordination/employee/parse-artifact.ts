import type { ArtifactFile } from "@weave/protocol";
import { isRecord, readList, readPattern, readString, type FieldContext } from "../../shared/index.ts";
import type { ArtifactInput } from "../dependencies/index.ts";
import {
  MAX_ARTIFACT_FILE_CHARS,
  MAX_ARTIFACT_FILES,
  MAX_ARTIFACT_PATH_CHARS,
  MAX_EVENT_TEXT_CHARS,
  OUTPUT_NAME_PATTERN,
} from "./constants.ts";

const UNSAFE_PATH = /(?:^|[\\/])\.\.(?:[\\/]|$)|^[\\/]|^[A-Za-z]:/;

function parseFile(raw: unknown, where: string, issues: string[]): ArtifactFile | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const path = readString(ctx, "path", MAX_ARTIFACT_PATH_CHARS);
  const content = typeof raw["content"] === "string" && raw["content"].length <= MAX_ARTIFACT_FILE_CHARS ? raw["content"] : null;
  if (content === null) issues.push(`${where}: "content" must be a string of at most ${MAX_ARTIFACT_FILE_CHARS} characters`);
  if (path !== null && UNSAFE_PATH.test(path)) issues.push(`${where}: "path" must be relative to the project: ${JSON.stringify(path)}`);
  if (path === null || content === null || UNSAFE_PATH.test(path)) return null;
  return { path, content };
}

export function parseArtifact(raw: unknown, where: string, issues: string[]): ArtifactInput | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const name = readPattern(ctx, "name", OUTPUT_NAME_PATTERN);
  const summary = readString(ctx, "summary", MAX_EVENT_TEXT_CHARS);
  const files = readList(ctx, "files", MAX_ARTIFACT_FILES, parseFile);
  if (name === null || summary === null) return null;
  return { name, summary, files };
}
