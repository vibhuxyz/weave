import { buildSkillRegistry, discoverSkills, loadEmployeeRegistry } from "@weave/core";
import { errorMessage, type ServerMessage } from "../shared/index.ts";
import { toSkillViews, type SkillListing } from "./to-skill-views.ts";

export interface SkillListingContext {
  readonly projectDir: string;
  readonly skillDirs: readonly string[];
  readonly send: (msg: ServerMessage) => void;
}

async function listSkills(projectDir: string, skillDirs: readonly string[]): Promise<SkillListing> {
  const [entries, employees] = await Promise.all([discoverSkills(skillDirs), loadEmployeeRegistry({ projectRoot: projectDir })]);
  const registry = buildSkillRegistry(entries);
  return toSkillViews({ skills: registry.skills, overridden: registry.overridden, employees: employees.employees });
}

export async function sendSkillListing(ctx: SkillListingContext): Promise<void> {
  try {
    ctx.send({ type: "skills", ...(await listSkills(ctx.projectDir, ctx.skillDirs)) });
  } catch (error) {
    ctx.send({ type: "skills-failed", message: `Cannot load skills for ${ctx.projectDir}: ${errorMessage(error)}` });
  }
}
