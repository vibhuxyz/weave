import { commitAll, readGitStatus, renderEstimateNotes, type Ledger } from "@weave/core";
import type { PromptImageData, ServerMessage } from "../shared/index.ts";
import type { TurnEstimates, TurnHandoff } from "../team-tools/index.ts";
import { TEAM_RUN_COMMIT_MESSAGE } from "./constants.ts";
import { releaseToTeam } from "./settle-handoff.ts";
import type { TeamRunStart, TurnWatch } from "./types.ts";
import { armHandoff } from "./watch-turn.ts";

export function handoffWhenClosed(input: {
  readonly watch: TurnWatch;
  readonly projectDir: string;
  readonly request: string;
  readonly images?: readonly PromptImageData[];
  readonly ledger: Ledger;
  readonly send: (message: ServerMessage) => void;
  readonly startTeamRun: (start: TeamRunStart) => void;
  readonly teamEstimates: TurnEstimates & TurnHandoff;
}): () => Promise<void> {
  return armHandoff(input.watch, () => {
    const accepted = input.teamEstimates.currentHandoff();
    const estimate = input.teamEstimates.latest();
    return releaseToTeam({
      accepted,
      readText: () => input.watch.read(),
      readUncommitted: async () => {
        const status = await readGitStatus(input.projectDir);
        input.send({ type: "git-status", git: status });
        return status.changes.map((change) => change.path);
      },
      request: input.request,
      estimateNotes: estimate ? renderEstimateNotes(estimate) : "",
      images: input.images,
      ledger: input.ledger,
      send: input.send,
      startTeamRun: input.startTeamRun,
      commitWork: () => commitAll(input.projectDir, TEAM_RUN_COMMIT_MESSAGE),
    });
  });
}
