import { applyConfigOptions, promptBlocks, type PromptBlock, type PromptImage } from "@weave/agent";
import type { RunConfig, Usage } from "@weave/protocol";
import { agentConfigFrom } from "@weave/protocol";
import type { RunTaskTracker } from "./sink.ts";
import type { RunTaskContext, Session } from "./types.ts";

export async function applyWantedConfigOptions(
  ctx: RunTaskContext,
  session: Session,
  config: RunConfig | undefined,
): Promise<void> {
  const wanted = config ? agentConfigFrom(config) : {};
  if (Object.keys(wanted).length === 0) return;
  const { refused } = await applyConfigOptions(
    (configId, value) => session.setConfigOption(configId, value),
    wanted,
  );
  for (const [configId, message] of Object.entries(refused)) {
    ctx.emit(
      ctx.ledger.append("error", { taskId: ctx.task.id, where: `setConfigOption(${configId})`, message }),
    );
  }
}

interface DeadlineSession {
  prompt(blocks: PromptBlock[]): Promise<{ stopReason: string; usage?: Usage | null }>;
  cancel(): Promise<void>;
}

export async function promptWithDeadline(
  session: DeadlineSession,
  prompt: string,
  timeoutMs: number,
  tracker: RunTaskTracker,
  images?: readonly PromptImage[],
): Promise<{ stopReason: string; usage?: Usage | null }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ stopReason: string; usage?: Usage | null }>((done) => {
    timer = setTimeout(() => {
      if (!tracker.stopped) tracker.stopped = "timeoutMs";
      void session.cancel().catch(() => {});
      done({ stopReason: "timeout" });
    }, timeoutMs);
  });

  return Promise.race([session.prompt([...promptBlocks(prompt, images)]), deadline]).finally(() =>
    clearTimeout(timer),
  );
}
