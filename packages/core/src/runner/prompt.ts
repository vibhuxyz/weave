import { applyConfigOptions } from "@weave/agent";
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

export async function promptWithDeadline(
  session: Session,
  prompt: string,
  timeoutMs: number,
  tracker: RunTaskTracker,
): Promise<{ stopReason: string; usage?: Usage | null }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<{ stopReason: string; usage?: Usage | null }>((done) => {
    timer = setTimeout(() => {
      if (!tracker.stopped) tracker.stopped = "timeoutMs";
      void session.cancel().catch(() => {});
      done({ stopReason: "timeout" });
    }, timeoutMs);
  });

  return Promise.race([session.prompt([{ type: "text", text: prompt }]), deadline]).finally(() =>
    clearTimeout(timer),
  );
}
