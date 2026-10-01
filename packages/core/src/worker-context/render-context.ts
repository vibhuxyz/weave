import { frameworksOf, layerOf, renderProjectContext, type ProjectAnswer } from "../context/index.ts";
import { briefOf } from "../handoff/index.ts";
import { pickSkills, renderSkills, type SkillPick } from "../skills/index.ts";
import { TASK_NOTES_INSTRUCTION } from "../state/index.ts";
import { MAX_LISTED_TEAMMATES, MAX_TASK_BYTES, MAX_WORKER_CONTEXT_BYTES, SECTION_BUDGETS } from "./constants.ts";
import type { ContextSection, ContextSectionName, ContextSources, WorkerContext, WorkerTask } from "./types.ts";

interface Rendered {
  readonly name: ContextSectionName;
  readonly text: string;
  readonly isCut: boolean;
}

function capBytes(text: string, maxBytes: number): { readonly text: string; readonly isCut: boolean } {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return { text, isCut: false };
  return { text: `${Buffer.from(text, "utf8").subarray(0, maxBytes).toString("utf8")}\n…(cut)`, isCut: true };
}

function escaped(text: string, tag: string): string {
  return text.replaceAll(`</${tag}>`, `<\\/${tag}>`);
}

function wrapEntries(tag: string, entries: readonly string[], maxBytes: number): { readonly text: string; readonly isCut: boolean } {
  const kept: string[] = [];
  let bytes = 0;
  for (const entry of entries.map((value) => escaped(value, tag))) {
    const size = Buffer.byteLength(`${entry}\n\n`, "utf8");
    if (bytes + size > maxBytes) break;
    kept.push(entry);
    bytes += size;
  }
  const cut = entries.length - kept.length;
  if (kept.length === 0 && cut === 0) return { text: "", isCut: false };
  return { text: [`<${tag}>`, ...kept, ...(cut > 0 ? [`(${cut} more left out to stay under ${maxBytes} bytes)`] : []), `</${tag}>`].join("\n\n"), isCut: cut > 0 };
}

export interface SkillSelectionInput {
  readonly model: ContextSources["model"];
  readonly answer: ProjectAnswer;
  readonly registry: ContextSources["skills"];
  readonly text: string;
  readonly allowedPaths?: readonly string[];
  readonly requested?: readonly string[];
}

export function selectSkills(input: SkillSelectionInput): SkillPick {
  const { model, answer } = input;
  const paths = [...answer.files.map((file) => file.path), ...(input.allowedPaths ?? [])];
  const touched = new Set([answer.application?.name, ...answer.files.map((file) => file.workspace)]);
  const workspaces = [...model.applications, ...model.packages].filter((workspace) => touched.has(workspace.name));
  const packages = workspaces.length > 0 ? [...new Set(workspaces.flatMap((workspace) => workspace.dependencies))] : model.dependencies.external.map((entry) => entry.name);
  return pickSkills(input.registry.skills, {
    text: input.text,
    paths,
    languages: model.stack.languages,
    frameworks: workspaces.length > 0 ? frameworksOf(packages) : model.stack.frameworks,
    packages,
    layers: [...new Set(answer.files.map((file) => layerOf(file.path, "source")))],
  }, input.requested ?? []);
}

function dependencyLines(task: ContextSources["task"]): readonly string[] {
  const dependencies = task.dependencies ?? [];
  if (dependencies.length === 0) return [];
  const needed = dependencies.filter((dependency) => dependency.requiredOutputs.length > 0);
  const whole = dependencies.filter((dependency) => dependency.requiredOutputs.length === 0);
  return [
    ...(needed.length > 0
      ? [
          `Start now. Later you will need ${needed.map((dependency) => `${dependency.requiredOutputs.join(", ")} from ${dependency.task}`).join("; ")}.`,
          "Do everything that does not need them first. When you reach the point where you genuinely need one, publish a dependency.blocked event naming that output and carry on with whatever else you can do; Weave delivers it to you as soon as it exists.",
        ]
      : []),
    ...(whole.length > 0 ? [`${whole.map((dependency) => dependency.task).join(", ")} finished before you started, so their work is already in your copy.`] : []),
  ];
}

function milestoneLines(task: ContextSources["task"]): readonly string[] {
  const subtasks = task.subtasks ?? [];
  if (subtasks.length === 0) return [];
  const done = new Set(task.subtasksDone ?? []);
  const listed = subtasks.map((subtask, index) => `${index + 1}. ${subtask}${done.has(subtask) ? " — already reported as done" : ""}`);
  return [
    "Milestones Weave tracks for you. Report each one with a subtask.completed event the moment it is done, wording it exactly as listed here:",
    ...listed,
  ];
}

function verificationLine(task: ContextSources["task"]): readonly string[] {
  if (task.verify) return [`Your work must pass ${task.verifyRung ?? "verification"}: run ${task.verify} before you finish.`];
  return task.verifyRung ? [`Your work must pass ${task.verifyRung} before it can merge.`] : [];
}

function teamLine(task: WorkerTask): string {
  const teammates = task.sharedWith ?? [];
  if (teammates.length === 0) {
    return `You are worker ${task.id} on this run's team. Other workers may be changing their own copies of this repository at the same time; the paths and outputs below are how you stay out of their way.`;
  }
  const listed = teammates.slice(0, MAX_LISTED_TEAMMATES).map((mate) => `${mate.id} (${mate.allowedPaths.join(", ") || "any path"})`);
  const more = teammates.length > MAX_LISTED_TEAMMATES ? ` and ${teammates.length - MAX_LISTED_TEAMMATES} more` : "";
  return `You are worker ${task.id} on this run's team, and you share this folder with the other workers running at the same time: ${listed.join("; ")}${more}. Their edits appear on disk and in git status while you work; that is expected. Leave their files alone: do not edit, revert, commit or investigate them.`;
}

function taskSection(sources: ContextSources): Rendered {
  const { task } = sources;
  const goal = capBytes(task.goal, MAX_TASK_BYTES);
  const lines = [
    "<task>",
    teamLine(task),
    escaped(goal.text, "task"),
    ...(task.allowedPaths?.length ? [`You may write only: ${task.allowedPaths.join(", ")}`] : []),
    ...(task.readOnlyPaths?.length ? [`Read but never edit: ${task.readOnlyPaths.join(", ")}`] : []),
    ...dependencyLines(task),
    ...(task.produces?.length ? [`Publish these outputs as soon as each one exists, before the rest of your task: ${task.produces.join(", ")}`] : []),
    ...milestoneLines(task),
    ...verificationLine(task),
    TASK_NOTES_INSTRUCTION,
    "</task>",
  ];
  return { name: "task", text: lines.join("\n"), isCut: goal.isCut };
}

export function renderWorkerContext(sources: ContextSources): WorkerContext {
  const { answer } = sources;
  const { chosen: skills, unknown: unknownSkills } = selectSkills({ model: sources.model, answer, registry: sources.skills, text: sources.task.goal, allowedPaths: sources.task.allowedPaths, requested: sources.task.skills });
  const code = wrapEntries("code-excerpts", sources.snippets.map((snippet) => `### ${snippet.path}:${snippet.startLine} (${snippet.symbol})\n\`\`\`\n${snippet.text}\n\`\`\``), SECTION_BUDGETS.code);
  const rules = wrapEntries("project-rules", sources.rules.map((rule) => `## ${rule.name} (${rule.sourcePath})\n${rule.body}`), SECTION_BUDGETS.rules);
  const project = renderProjectContext(answer, SECTION_BUDGETS.project - 200);
  const state = sources.state ? capBytes(`<task-state>\nRecorded by Weave for this task so far. The files on disk are authoritative.\n\n${escaped(briefOf(sources.state, SECTION_BUDGETS.state - 200, sources.engineId), "task-state")}\n</task-state>`, SECTION_BUDGETS.state) : { text: "", isCut: false };
  const skillsText = renderSkills(skills, SECTION_BUDGETS.skills);
  const candidates: readonly Rendered[] = [
    { name: "project", text: project, isCut: project.includes("more lines cut") },
    { name: "code", ...code },
    { name: "rules", ...rules },
    { name: "skills", text: skillsText, isCut: skillsText.includes("more skills left out") },
    { name: "state", ...state },
    taskSection(sources),
  ];
  const sections = candidates.filter((section) => section.text.length > 0);
  const prompt = capBytes(sections.map((section) => section.text).join("\n\n"), MAX_WORKER_CONTEXT_BYTES).text;
  const report: readonly ContextSection[] = sections.map((section) => ({ name: section.name, bytes: Buffer.byteLength(section.text, "utf8"), isCut: section.isCut }));
  return { prompt, contextVersion: sources.model.revision, skills: skills.map((resolved) => resolved.skill.id), unknownSkills, sections: report };
}
