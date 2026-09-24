import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
  COMMITTED_RULES_DIR,
  COMMITTED_SKILLS_DIR,
  DATABASE_FILE_NAME,
  DATA_DIR_NAME,
  LOGS_DIR_NAME,
  PROJECTS_DIR_NAME,
  RULES_DIR_NAME,
  SKILLS_DIR_NAME,
  WEAVE_HOME_DIR_NAME,
} from "./constants.ts";
import type { ProjectLocations, ProjectRecord, WeaveLocations } from "./types.ts";

export function weaveLocations(homeOverride: string | undefined): WeaveLocations {
  const home = homeOverride && isAbsolute(homeOverride) ? resolve(homeOverride) : join(homedir(), WEAVE_HOME_DIR_NAME);
  return {
    home,
    databasePath: join(home, DATA_DIR_NAME, DATABASE_FILE_NAME),
    globalSkillsDir: join(home, SKILLS_DIR_NAME),
    globalRulesDir: join(home, RULES_DIR_NAME),
  };
}

export function projectLocations(weave: WeaveLocations, project: ProjectRecord): ProjectLocations {
  const dataDir = join(weave.home, PROJECTS_DIR_NAME, project.id);
  return {
    dataDir,
    logsDir: join(dataDir, LOGS_DIR_NAME),
    skillDirs: [join(dataDir, SKILLS_DIR_NAME), join(project.rootPath, COMMITTED_SKILLS_DIR), weave.globalSkillsDir],
    ruleDirs: [join(dataDir, RULES_DIR_NAME), join(project.rootPath, COMMITTED_RULES_DIR), weave.globalRulesDir],
  };
}
