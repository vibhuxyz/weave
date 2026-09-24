import type { TaskDependencyRef, TaskState } from "@weave/protocol";
import type { ProjectAnswer, ProjectModel } from "../context/index.ts";
import type { RuleEntry } from "../discovery/index.ts";
import type { SkillRegistry } from "../skills/index.ts";

export interface WorkerTask {
  readonly id: string;
  readonly goal: string;
  readonly allowedPaths?: readonly string[];
  readonly readOnlyPaths?: readonly string[];
  readonly dependencies?: readonly TaskDependencyRef[];
}

export interface CodeSnippet {
  readonly path: string;
  readonly symbol: string;
  readonly startLine: number;
  readonly text: string;
}

export interface ContextSources {
  readonly task: WorkerTask;
  readonly model: ProjectModel;
  readonly answer: ProjectAnswer;
  readonly state: TaskState | null;
  readonly snippets: readonly CodeSnippet[];
  readonly rules: readonly RuleEntry[];
  readonly skills: SkillRegistry;
}

export type ContextSectionName = "task" | "project" | "code" | "rules" | "skills" | "state";

export interface ContextSection {
  readonly name: ContextSectionName;
  readonly bytes: number;
  readonly isCut: boolean;
}

export interface WorkerContext {
  readonly prompt: string;
  readonly contextVersion: number;
  readonly skills: readonly string[];
  readonly sections: readonly ContextSection[];
}
