import { readGitStatus, readHeadCommit } from "../shared/index.ts";
import type { AttemptInspection } from "./types.ts";

const MAX_LISTED_FILES = 40;

export interface InspectInput {
  readonly cwd: string;
  readonly taskId: string;
}

export async function inspectWorkspace(input: InspectInput): Promise<AttemptInspection> {
  const [status, head] = await Promise.all([readGitStatus(input.cwd), readHeadCommit(input.cwd)]);
  const modifiedFiles = status.changes
    .map((change) => change.path)
    .sort()
    .slice(0, MAX_LISTED_FILES);
  return {
    checkpoint: head,
    modifiedFiles,
    isDirty: status.changes.length > 0,
    truncated: status.changes.length > MAX_LISTED_FILES,
  };
}
