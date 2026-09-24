import { frameworksOf, layerOf, renderProjectContext, type ProjectAnswer } from "../context/index.ts";
import { briefOf } from "../handoff/index.ts";
import { renderSkills, resolveSkills, type ResolvedSkill } from "../skills/index.ts";
import { TASK_NOTES_INSTRUCTION } from "../state/index.ts";
import { MAX_TASK_BYTES, MAX_WORKER_CONTEXT_BYTES, SECTION_BUDGETS } from "./constants.ts";
import type { ContextSection, ContextSectionName, ContextSources, WorkerContext } from "./types.ts";

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
}

export function selectSkills(input: SkillSelectionInput): readonly ResolvedSkill[] {
  const { model, answer } = input;
  const paths = [...answer.files.map((file) => file.path), ...(input.allowedPaths ?? [])];
  const touched = new Set([answer.application?.name, ...answer.files.map((file) => file.workspace)]);
  const workspaces = [...model.applications, ...model.packages].filter((workspace) => touched.has(workspace.name));
  const packages = workspaces.length > 0 ? [...new Set(workspaces.flatMap((workspace) => workspace.dependencies))] : model.dependencies.external.map((entry) => entry.name);
  return resolveSkills(input.registry.skills, {
    text: input.text,
    paths,
    languages: model.stack.languages,
    frameworks: workspaces.length > 0 ? frameworksOf(packages) : model.stack.frameworks,
    packages,
    layers: [...new Set(answer.files.map((file) => layerOf(file.path, "source")))],
  });
}

function taskSection(sources: ContextSources): Rendered {
  const { task } = sources;
  const goal = capBytes(task.goal, MAX_TASK_BYTES);
  const lines = [
    "<task>",
    escaped(goal.text, "task"),
    ...(task.allowedPaths?.length ? [`You may write only: ${task.allowedPaths.join(", ")}`] : []),
    ...(task.readOnlyPaths?.length ? [`Read but never edit: ${task.readOnlyPaths.join(", ")}`] : []),
    ...(task.dependencies?.length ? [`Depends on: ${task.dependencies.map((dependency) => `${dependency.task} (${dependency.requiredOutputs.join(", ") || "all"})`).join("; ")}`] : []),
    TASK_NOTES_INSTRUCTION,
    "</task>",
  ];
  return { name: "task", text: lines.join("\n"), isCut: goal.isCut };
}

export function renderWorkerContext(sources: ContextSources): WorkerContext {
  const { answer } = sources;
  const skills = selectSkills({ model: sources.model, answer, registry: sources.skills, text: sources.task.goal, allowedPaths: sources.task.allowedPaths });
  const code = wrapEntries("code-excerpts", sources.snippets.map((snippet) => `### ${snippet.path}:${snippet.startLine} (${snippet.symbol})\n\`\`\`\n${snippet.text}\n\`\`\``), SECTION_BUDGETS.code);
  const rules = wrapEntries("project-rules", sources.rules.map((rule) => `## ${rule.name} (${rule.sourcePath})\n${rule.body}`), SECTION_BUDGETS.rules);
  const project = renderProjectContext(answer, SECTION_BUDGETS.project - 200);
  const state = sources.state ? capBytes(`<task-state>\nRecorded by Weave for this task so far. The files on disk are authoritative.\n\n${escaped(briefOf(sources.state, SECTION_BUDGETS.state - 200), "task-state")}\n</task-state>`, SECTION_BUDGETS.state) : { text: "", isCut: false };
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
  return { prompt, contextVersion: sources.model.revision, skills: skills.map((resolved) => resolved.skill.id), sections: report };
}
