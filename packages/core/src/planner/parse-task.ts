import type { TaskDependency, VerificationRung } from "@weave/protocol";
import { VERIFICATION_RUNGS } from "@weave/protocol";
import {
  isRecord,
  isSafeRelativeGlob,
  readList,
  readOptionalString,
  readPattern,
  readString,
  readStringList,
  type FieldContext,
} from "../shared/index.ts";
import {
  COMPONENT_PATTERN,
  MAX_DEPENDENCIES_PER_TASK,
  MAX_PATHS_PER_TASK,
  MAX_PATH_CHARS,
  MAX_REQUIRED_OUTPUTS,
  MAX_SYMBOLS_PER_TASK,
  MAX_SYMBOL_CHARS,
  MAX_TASK_PROMPT_CHARS,
  MAX_TITLE_CHARS,
  MAX_VERIFY_COMMAND_CHARS,
  TASK_ID_PATTERN,
} from "./constants.ts";
import type { PlannedTask } from "./types.ts";

function parseDependency(raw: unknown, where: string, issues: string[]): TaskDependency | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = { record: raw, where, issues };
  const task = readPattern(ctx, "task", TASK_ID_PATTERN);
  const requiredOutputs = readStringList(ctx, "requiredOutputs", {
    maxItems: MAX_REQUIRED_OUTPUTS,
    maxChars: MAX_SYMBOL_CHARS,
  });
  return task === null ? null : { task, requiredOutputs };
}

function readGlobs(ctx: FieldContext, key: string): string[] {
  const globs = readStringList(ctx, key, { maxItems: MAX_PATHS_PER_TASK, maxChars: MAX_PATH_CHARS });
  for (const glob of globs.filter((candidate) => !isSafeRelativeGlob(candidate))) {
    ctx.issues.push(`${ctx.where}: "${key}" entry ${JSON.stringify(glob)} must be a relative path inside the project`);
  }
  return globs;
}

function readVerifyRung(ctx: FieldContext): VerificationRung | null {
  const value = readOptionalString(ctx, "verifyRung", MAX_SYMBOL_CHARS);
  if (value === null) return null;
  const rung = VERIFICATION_RUNGS.find((candidate) => candidate === value);
  if (!rung) ctx.issues.push(`${ctx.where}: "verifyRung" ${JSON.stringify(value)} is not a verification rung`);
  return rung ?? null;
}

function readVerify(ctx: FieldContext): Pick<PlannedTask, "verify" | "verifyRung"> {
  const verify = readOptionalString(ctx, "verify", MAX_VERIFY_COMMAND_CHARS);
  const verifyRung = readVerifyRung(ctx);
  if (verify !== null && verifyRung === null) {
    ctx.issues.push(`${ctx.where}: "verify" requires "verifyRung"`);
  }
  return {
    ...(verify !== null ? { verify } : {}),
    ...(verifyRung !== null ? { verifyRung } : {}),
  };
}

function readScope(ctx: FieldContext): Pick<PlannedTask, "allowedPaths" | "readOnlyPaths"> {
  const allowedPaths = readGlobs(ctx, "allowedPaths");
  if (allowedPaths.length === 0) ctx.issues.push(`${ctx.where}: "allowedPaths" must list at least one path`);
  return { allowedPaths, readOnlyPaths: readGlobs(ctx, "readOnlyPaths") };
}

function readLinks(ctx: FieldContext): Pick<PlannedTask, "dependencies" | "contractSymbols" | "component"> {
  const component = readOptionalString(ctx, "component", MAX_SYMBOL_CHARS);
  if (component !== null && !COMPONENT_PATTERN.test(component)) {
    ctx.issues.push(`${ctx.where}: "component" has an invalid format: ${JSON.stringify(component)}`);
  }
  return {
    dependencies: readList(ctx, "dependencies", MAX_DEPENDENCIES_PER_TASK, parseDependency),
    contractSymbols: readStringList(ctx, "contractSymbols", {
      maxItems: MAX_SYMBOLS_PER_TASK,
      maxChars: MAX_SYMBOL_CHARS,
    }),
    ...(component !== null ? { component } : {}),
  };
}

export function parseTask(raw: unknown, where: string, issues: string[], cwd: string): PlannedTask | null {
  if (!isRecord(raw)) {
    issues.push(`${where} must be an object`);
    return null;
  }
  const ctx: FieldContext = {
    record: raw,
    where: typeof raw.id === "string" ? `Task ${raw.id}` : where,
    issues,
  };
  const issuesBefore = issues.length;

  const id = readPattern(ctx, "id", TASK_ID_PATTERN);
  const title = readString(ctx, "title", MAX_TITLE_CHARS);
  const prompt = readString(ctx, "prompt", MAX_TASK_PROMPT_CHARS);
  const scope = readScope(ctx);
  const links = readLinks(ctx);
  const verify = readVerify(ctx);

  if (issues.length > issuesBefore || id === null || title === null || prompt === null) return null;
  return { id, title, prompt, cwd, ...scope, ...links, ...verify };
}
