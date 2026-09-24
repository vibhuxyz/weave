import { isProjectDir } from "../chat/index.ts";
import { removeProjectData } from "../storage/index.ts";
import type { DeleteProjectOptions } from "./types.ts";

export async function handleDeleteProject(request: { readonly projectDir: unknown }, options: DeleteProjectOptions): Promise<void> {
  const { projectDir } = request;
  if (!isProjectDir(projectDir)) {
    options.send({ type: "error", message: "Cannot delete project: the request needs a project folder." });
    return;
  }
  const project = await options.directory.projectForFolder(projectDir);
  if (project?.id === options.currentProjectId) {
    options.send({ type: "error", message: `Cannot delete ${projectDir} while it is open. Switch to another project first.` });
    return;
  }
  const deleted = await options.directory.deleteProject(projectDir);
  if (deleted) {
    const removed = await removeProjectData(options.weaveHome, deleted.projectId);
    if (!removed.ok) options.send({ type: "error", message: `Deleted ${projectDir} from Weave, but ${removed.reason}` });
  }
  options.send({ type: "project-deleted", projectDir, removedChatCount: deleted?.removedChatCount ?? 0 });
}
