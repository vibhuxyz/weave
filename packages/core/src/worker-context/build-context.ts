import { join } from "node:path";
import type { TaskState } from "@weave/protocol";
import { queryProject, type ProjectModel } from "../context/index.ts";
import { discoverRules, discoverSkills } from "../discovery/index.ts";
import { buildSkillRegistry } from "../skills/index.ts";
import { RULE_DIRS, SKILL_DIRS } from "./constants.ts";
import { readSnippets, snippetTargets } from "./code-snippets.ts";
import { renderWorkerContext } from "./render-context.ts";
import type { WorkerContext, WorkerTask } from "./types.ts";

export interface BuildWorkerContextInput {
  readonly root: string;
  readonly task: WorkerTask;
  readonly model: ProjectModel;
  readonly state?: TaskState | null;
}

export async function buildWorkerContext(input: BuildWorkerContextInput): Promise<WorkerContext> {
  const { root, task, model } = input;
  const answer = queryProject(model, task.goal);
  const [snippets, rules, projectSkills] = await Promise.all([
    readSnippets(root, snippetTargets(model, answer.symbols.map((entry) => entry.symbol.id))),
    discoverRules(RULE_DIRS.map((dir) => join(root, dir))),
    discoverSkills(SKILL_DIRS.map((dir) => join(root, dir))),
  ]);
  return renderWorkerContext({ task, model, answer, state: input.state ?? null, snippets, rules, skills: buildSkillRegistry(projectSkills) });
}
