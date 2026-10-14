import type { PlannedTask } from "../../planner/index.ts";
import { flatten } from "../../shared/index.ts";
import { DIRECT_TASK_ID, START_NOTE } from "./constants.ts";

const MAX_TITLE_CHARS = 120;

export function directTask(request: string, cwd: string, warnings: readonly string[]): PlannedTask {
  const trimmed = request.trim();
  const title = flatten(trimmed).slice(0, MAX_TITLE_CHARS) || "Do the requested work";
  const notice = warnings.length === 0 ? "" : `\n\n${warnings.join("\n")}`;
  return { id: DIRECT_TASK_ID, title, prompt: `${trimmed}\n\n${START_NOTE}${notice}`, cwd, complexity: "medium" };
}
