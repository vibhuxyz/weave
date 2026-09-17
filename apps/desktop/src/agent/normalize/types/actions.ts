import type { GitStatus } from "../../../../server/index.ts";
import type { AgentStatus } from "./taskState";

export type BlockAction =
  | { type: "open_file"; file: string; line?: number }          // filesystem file
  | { type: "open_output"; outputRef: string }                  // ledger output artifact
  | { type: "view_evidence"; evidenceId: string }
  | { type: "rerun"; testId: string }
  | { type: "send_message"; text: string }
  | { type: "apply_fix"; findingId: string }
  | { type: "continue_with_engine"; engineId: string; checkpointId: string }
  | { type: "cancel_run" }
  | { type: "resume_run"; checkpointId: string };

export interface NormalizeContext {
  projectDir: string | null;
  git: GitStatus;
  status: AgentStatus;
  configValues: Record<string, string>;
}
