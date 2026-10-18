import { spawn } from "node:child_process";
import { errorMessage } from "../shared/index.ts";
import { CAFFEINATE_PATH, KEEP_AWAKE_PLATFORM, PREVENT_IDLE_SLEEP_FLAG, WAIT_FOR_PROCESS_FLAG } from "./constants.ts";
import type { AwakeHold, HoldAwake } from "./types.ts";

const NO_HOLD: AwakeHold = { release: () => undefined };

export const holdAwake: HoldAwake = (onProblem) => {
  if (process.platform !== KEEP_AWAKE_PLATFORM) return NO_HOLD;
  const child = spawn(CAFFEINATE_PATH, [PREVENT_IDLE_SLEEP_FLAG, WAIT_FOR_PROCESS_FLAG, String(process.pid)], { stdio: "ignore" });
  child.once("error", (error: unknown) => {
    onProblem(`Cannot keep this Mac awake during the run (${CAFFEINATE_PATH}: ${errorMessage(error)}). If the Mac sleeps, the workers pause until it wakes.`);
  });
  child.unref();
  return { release: () => { child.kill(); } };
};
