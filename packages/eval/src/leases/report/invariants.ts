import type { SimEvent, SimulationResult } from "../types.ts";
import type { Violation } from "./types.ts";

type Check = (result: SimulationResult) => string | null;

const ENDING_TYPES: ReadonlySet<SimEvent["type"]> = new Set(["expired", "released", "rejected"]);
const MAX_LISTED = 10;

function listed(items: readonly string[]): string {
  const more = items.length > MAX_LISTED ? ` (+${items.length - MAX_LISTED} more)` : "";
  return `${items.slice(0, MAX_LISTED).join(", ")}${more}`;
}

const everyTaskSettled: Check = ({ isComplete, finalStates }) =>
  isComplete ? null : `the run stopped with ${finalStates.queued} queued, ${finalStates.leased} leased and ${finalStates.verifying} verifying task(s)`;

const verifiedOnce: Check = ({ events }) => {
  const seen = new Set<string>();
  const twice = events.flatMap((event) => {
    if (event.type !== "verified") return [];
    const isRepeat = seen.has(event.taskId);
    seen.add(event.taskId);
    return isRepeat ? [event.taskId] : [];
  });
  return twice.length === 0 ? null : `verified more than once: ${listed(twice)}`;
};

const oneOwnerAtATime: Check = ({ events }) => {
  const ended = new Set<number>();
  const holder = new Map<string, number>();
  const doubled: string[] = [];
  for (const event of events) {
    if (ENDING_TYPES.has(event.type) && "token" in event) ended.add(event.token);
    if (event.type !== "leased") continue;
    const previous = holder.get(event.taskId);
    if (previous !== undefined && !ended.has(previous)) doubled.push(`${event.taskId} (token ${previous} and ${event.token})`);
    holder.set(event.taskId, event.token);
  }
  return doubled.length === 0 ? null : `two live owners: ${listed(doubled)}`;
};

const onlyCurrentHolderCompletes: Check = ({ events }) => {
  const current = new Map<string, number>();
  const stale = events.flatMap((event) => {
    if (event.type === "leased") current.set(event.taskId, event.token);
    return event.type === "completed" && current.get(event.taskId) !== event.token ? [`${event.taskId} by ${event.workerId}`] : [];
  });
  return stale.length === 0 ? null : `stale results accepted: ${listed(stale)}`;
};

const lostTasksRecovered: Check = ({ events }) => {
  const settled = new Set(events.flatMap((event) => (event.type === "verified" || event.type === "failed" ? [event.taskId] : [])));
  const lost = events.flatMap((event) => ((event.type === "crashed" || event.type === "hung") && !settled.has(event.taskId) ? [event.taskId] : []));
  return lost.length === 0 ? null : `lost and never recovered: ${listed([...new Set(lost)])}`;
};

export const INVARIANTS = [
  { name: "every task ended verified or failed", check: everyTaskSettled },
  { name: "no task was verified twice", check: verifiedOnce },
  { name: "a task never had two live owners", check: oneOwnerAtATime },
  { name: "only the current lease holder's result was accepted", check: onlyCurrentHolderCompletes },
  { name: "every task a worker lost was taken over", check: lostTasksRecovered },
] as const;

export function violationsOf(result: SimulationResult): readonly Violation[] {
  return INVARIANTS.flatMap(({ name, check }) => {
    const problem = check(result);
    return problem === null ? [] : [{ name, problem }];
  });
}
