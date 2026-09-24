import { buildProjectModel, buildSkillRegistry, queryProject, renderSkills, resolveSkills, selectSkills, updateProjectModel, type ProjectModel } from "@weave/core";
import { errorMessage } from "../shared/index.ts";

export type SkillSelector = (text: string) => Promise<string>;

const REFRESH_AFTER_MS = 60_000;

interface ModelSlot {
  readonly model: Promise<ProjectModel | null>;
  readonly builtAt: number;
}

function logBuildFailure(error: unknown): null {
  console.error(JSON.stringify({ level: "error", component: "skill-selector", message: "Project model build failed; skills are chosen from the prompt text only", detail: errorMessage(error) }));
  return null;
}

export function createSkillSelector(projectDir: string, dataDir: string, now: () => number = Date.now): SkillSelector {
  const registry = buildSkillRegistry([]);
  const build = (previous: ProjectModel | null) =>
    (previous ? updateProjectModel(previous, { root: projectDir, weaveDir: dataDir }) : buildProjectModel({ root: projectDir, weaveDir: dataDir })).then((built) => built.model, logBuildFailure);
  const slot: { current: ModelSlot } = { current: { model: build(null), builtAt: now() } };

  return async (text) => {
    const model = await slot.current.model;
    if (now() - slot.current.builtAt > REFRESH_AFTER_MS) slot.current = { model: build(model), builtAt: now() };
    if (!model) return renderSkills(resolveSkills(registry.skills, { text, paths: [], languages: [], frameworks: [], packages: [], layers: [] }));
    return renderSkills(selectSkills({ model, answer: queryProject(model, text), registry, text }));
  };
}
