import { AutoArchive } from "../archive/index.ts";
import { DecisionLog } from "../decisions/index.ts";
import { ChatDirectory, ProjectChats } from "../chat/index.ts";
import { HistoryStore } from "../history/index.ts";
import {
  ArchivesRepo,
  DecisionsRepo,
  ProjectsRepo,
  SessionsRepo,
  SettingsRepo,
  canonicalProjectPath,
  ensurePrivateDir,
  openDatabaseFile,
  projectLocations,
  weaveLocations,
} from "../storage/index.ts";
import type { ConnectionStorage } from "./types.ts";

export interface OpenedProjectStorage {
  readonly storage: ConnectionStorage;
  readonly projectId: string;
  readonly logsDir: string;
  readonly close: () => void;
}

export interface OpenProjectStorageOptions {
  readonly projectDir: string;
  readonly weaveHome: string | undefined;
  readonly now: () => number;
}

export async function openProjectStorage({ projectDir, weaveHome, now }: OpenProjectStorageOptions): Promise<OpenedProjectStorage> {
  const rootPath = await canonicalProjectPath(projectDir);
  if (!rootPath.ok) throw new Error(`Cannot open project: ${rootPath.reason}`);
  const weave = weaveLocations(weaveHome);
  ensurePrivateDir(weave.home);
  const db = openDatabaseFile(weave.databasePath);
  const projects = new ProjectsRepo(db);
  const sessions = new SessionsRepo(db);
  const project = projects.resolve(rootPath.value, now());
  const locations = projectLocations(weave, project);
  ensurePrivateDir(locations.dataDir);
  return {
    projectId: project.id,
    logsDir: locations.logsDir,
    close: () => db.close(),
    storage: {
      dataDir: locations.dataDir,
      skillDirs: locations.skillDirs,
      ruleDirs: locations.ruleDirs,
      chats: new ProjectChats({ project, workingDir: projectDir, sessions, projects, now }),
      directory: new ChatDirectory(projects, sessions),
      autoArchive: new AutoArchive({ settings: new SettingsRepo(db), sessions, now }),
      weaveHome: weave.home,
      history: new HistoryStore({ archives: new ArchivesRepo(db), projectId: project.id, now }),
      decisions: new DecisionLog({ repo: new DecisionsRepo(db), projectId: project.id, now }),
    },
  };
}
