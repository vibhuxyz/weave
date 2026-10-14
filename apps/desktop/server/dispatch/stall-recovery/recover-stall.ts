import { EngineStalledError } from "@weave/agent";
import type { PromptBlock } from "@weave/agent";
import { MAX_STALL_RECOVERIES } from "./constants.ts";

export interface StallRecoveryOptions<T> {
  readonly run: (blocks: readonly PromptBlock[]) => Promise<T>;
  readonly revive: () => Promise<unknown>;
  readonly resumeBlocks: () => readonly PromptBlock[];
  readonly onRecovering: (reason: string) => void;
  readonly isCancelled: () => boolean;
}

export function withStallRecovery<T>({
  run,
  revive,
  resumeBlocks,
  onRecovering,
  isCancelled,
}: StallRecoveryOptions<T>): (blocks: readonly PromptBlock[]) => Promise<T> {
  let recoveries = 0;

  const attempt = async (blocks: readonly PromptBlock[]): Promise<T> => {
    try {
      return await run(blocks);
    } catch (error: unknown) {
      if (!(error instanceof EngineStalledError)) throw error;
      if (recoveries >= MAX_STALL_RECOVERIES || isCancelled()) throw error;
      recoveries += 1;
      onRecovering(error.message);
      await revive();
      return attempt(resumeBlocks());
    }
  };

  return attempt;
}
