import { spawn } from "node:child_process";
import type { TaskContract } from "@berd/protocol";

export interface Score {
  taskId: string;
  /** Did the task's own verify command pass? The only objective signal. */
  verified: boolean | null;
  wallMs: number;
  filesWritten: number;
}

/** Run a task's `verify` command in its cwd. null when none is defined. */
export function verify(task: TaskContract): Promise<boolean | null> {
  if (!task.verify) return Promise.resolve(null);
  return new Promise((done) => {
    const child = spawn(task.verify!, {
      cwd: task.cwd,
      shell: true,
      stdio: "ignore",
    });
    child.on("error", () => done(false));
    child.on("close", (code) => done(code === 0));
  });
}
