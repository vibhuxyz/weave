import { MAX_FAST_REQUEST_CHARS, PATH_TOKEN, RISKY_WORDS, SMALL_EDITS } from "./constants.ts";
import type { Triage, TriageInput } from "./types.ts";

function plan(reason: string): Triage {
  return { route: "plan", reason };
}

function mentionedPaths(request: string): readonly string[] {
  return [...new Set([...request.matchAll(PATH_TOKEN)].flatMap((match) => match[1] ?? []))].sort();
}

export function triageRequest(input: TriageInput): Triage {
  const request = input.request.trim();
  if (input.kind !== "existing") return plan("a new project always needs a plan");
  if (request.length > MAX_FAST_REQUEST_CHARS || /\r?\n/.test(request)) return plan("the request is longer than one short line");
  const edit = SMALL_EDITS.find((candidate) => candidate.pattern.test(request));
  if (!edit) return plan("the request is not a recognised small edit");
  if (RISKY_WORDS.test(request)) return plan("the request touches a sensitive area");
  const paths = mentionedPaths(request);
  const [path, ...others] = paths;
  if (path === undefined || others.length > 0) return plan(`the request names ${paths.length} files, the fast path needs exactly one`);
  if (!input.filePaths.has(path)) return plan(`${path} is not a file in this project`);
  const classification = { taskType: edit.taskType, scope: "single-file", risk: "low", domains: [] } as const;
  return { route: "fast", path, reason: `${edit.name} in one existing file`, classification };
}
