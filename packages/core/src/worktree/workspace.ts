import { createWorktree, type Worktree } from "./worktree.ts";

export interface ResolveTaskWorkspaceInput {
  repoRoot: string;
  weaveDir: string;
  taskId: string;
  isolate: boolean;
}

export interface TaskWorkspace {
  cwd: string;
  worktree: Worktree | null;
}

export async function resolveTaskWorkspace(
  input: ResolveTaskWorkspaceInput,
): Promise<TaskWorkspace> {
  if (!input.isolate) {
    return { cwd: input.repoRoot, worktree: null };
  }
  const worktree = await createWorktree({
    repoRoot: input.repoRoot,
    weaveDir: input.weaveDir,
    taskId: input.taskId,
  });
  return { cwd: worktree.path, worktree };
}
