import { MAX_STORIES, MAX_TIMELINE_LINES } from "../constants.ts";
import type { SimEvent, SimulationConfig, SimulationResult } from "../types.ts";
import { INVARIANTS } from "./invariants.ts";
import type { Metrics, Recovery, Spread, Violation } from "./types.ts";

const MS_PER_SECOND = 1_000;
const PERCENT = 100;
const TIME_COLUMN = 7;
const WORKER_COLUMN = 6;

export function seconds(ms: number): string {
  return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}

function duration(ms: number): string {
  return ms < MS_PER_SECOND ? `${ms}ms` : seconds(ms);
}

export function percent(share: number): string {
  return `${Math.round(share * PERCENT)}%`;
}

function spreadText(spread: Spread | null): string {
  return spread === null ? "none" : `p50 ${seconds(spread.p50)} · p95 ${seconds(spread.p95)} · max ${seconds(spread.max)}`;
}

export function eventLine(event: SimEvent): string {
  const at = seconds(event.atMs).padStart(TIME_COLUMN);
  const who = ("workerId" in event ? event.workerId : "").padEnd(WORKER_COLUMN);
  switch (event.type) {
    case "leased": return `${at}  ${who} leased ${event.taskId} (attempt ${event.attempt}, token ${event.token})${event.previousWorkerId ? `, taking over from ${event.previousWorkerId}` : ""}`;
    case "expired": return `${at}  ${who} lost ${event.taskId}: no heartbeat, lease expired`;
    case "released": return `${at}  ${who} handed back ${event.taskId}: ${event.reason}`;
    case "completed": return `${at}  ${who} finished ${event.taskId}, sent to verification`;
    case "fenced": return `${at}  ${who} late write to ${event.taskId} blocked (${event.reason}, token ${event.token})`;
    case "verified": return `${at}  ${who} ${event.taskId} verified`;
    case "rejected": return `${at}  ${who} ${event.taskId} rejected: ${event.reason}`;
    case "failed": return `${at}  ${who} ${event.taskId} failed: ${event.reason}`;
    case "crashed": return `${at}  ${who} CRASHED while holding ${event.taskId}`;
    case "hung": return `${at}  ${who} HUNG while holding ${event.taskId} (stops heartbeating)`;
    case "woke": return `${at}  ${who} woke up and tries to finish ${event.taskId}`;
    case "restarted": return `${at}  ${who} restarted`;
    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

function storyLine(recovery: Recovery): string {
  const parts = [`${recovery.taskId}  ${recovery.lostWorkerId} ${recovery.cause} at ${seconds(recovery.lostAtMs)}`];
  if (recovery.expiredAtMs !== null) parts.push(`lease expired ${seconds(recovery.expiredAtMs)}`);
  parts.push(recovery.takenOverBy === null ? "never taken over" : `${recovery.takenOverBy} took over ${seconds(recovery.takenOverAtMs ?? 0)} (attempt ${recovery.attempt ?? "?"})`);
  parts.push(recovery.verifiedAtMs === null ? "not verified" : `verified ${seconds(recovery.verifiedAtMs)}`);
  const late = recovery.lateWrite ? ` · its late write at ${seconds(recovery.lateWrite.atMs)} was blocked (${recovery.lateWrite.reason})` : "";
  return `  ${parts.join(" → ")}${late}`;
}

function configLines(config: SimulationConfig): readonly string[] {
  return [
    `Lease simulation · seed ${config.seed} · ${config.tasks} tasks · ${config.workers} workers · lease ${duration(config.leaseMs)} · heartbeat ${duration(config.heartbeatMs)} · sweep ${duration(config.sweepMs)}`,
    `Faults per attempt: crash ${percent(config.crashRate)} · hang ${percent(config.hangRate)} · wrong output ${percent(config.wrongOutputRate)} · up to ${config.maxAttempts} attempts · ${percent(config.dependencyRate)} of tasks depend on an earlier one`,
    "Times are simulated: the clock is virtual, so a seed always replays exactly.",
    ...(config.heartbeatMs >= config.leaseMs ? ["Warning: the heartbeat is not shorter than the lease, so healthy workers will lose their tasks too."] : []),
  ];
}

function resultLines(result: SimulationResult, metrics: Metrics, wallMs: number): readonly string[] {
  return [
    "Result",
    `  verified ${metrics.verified}/${result.config.tasks} · failed ${metrics.failed} · finished in ${seconds(metrics.makespanMs)} simulated (${Math.round(wallMs)} ms real)`,
    `  throughput ${metrics.throughputPerSecond.toFixed(2)} tasks/s · workers busy ${percent(metrics.busyShare)} · wasted work ${percent(metrics.wastedShare)}`,
    `  task time (first lease → verified) ${spreadText(metrics.taskMs)}`,
    `  crashes ${metrics.crashes} · hangs ${metrics.hangs} · heartbeats ${metrics.heartbeats} · lease expiries ${metrics.expiries} · takeovers ${metrics.takeovers}`,
    `  late writes blocked ${metrics.fenced} · wrong outputs rejected ${metrics.rejected}`,
    `  recovery (worker lost → another worker owns the task, including waiting for a free worker) ${spreadText(metrics.recoveryMs)}`,
  ];
}

function storyLines(recoveries: readonly Recovery[]): readonly string[] {
  if (recoveries.length === 0) return ["No worker was lost, so nothing needed recovering."];
  const more = recoveries.length > MAX_STORIES ? [`  (+${recoveries.length - MAX_STORIES} more; use --timeline for all)`] : [];
  return [`How lost tasks came back (${Math.min(MAX_STORIES, recoveries.length)} of ${recoveries.length})`, ...recoveries.slice(0, MAX_STORIES).map(storyLine), ...more];
}

function invariantLines(violations: readonly Violation[]): readonly string[] {
  const problems = new Map(violations.map((violation) => [violation.name, violation.problem]));
  return ["Invariants", ...INVARIANTS.flatMap(({ name }) => {
    const problem = problems.get(name);
    return problem === undefined ? [`  ✓ ${name}`] : [`  ✗ ${name}`, `      ${problem}`];
  })];
}

export function timelineLines(events: readonly SimEvent[]): readonly string[] {
  const more = events.length > MAX_TIMELINE_LINES ? [`  (+${events.length - MAX_TIMELINE_LINES} more events)`] : [];
  return ["Timeline", ...events.slice(0, MAX_TIMELINE_LINES).map(eventLine), ...more];
}

export interface ReportInput {
  readonly result: SimulationResult;
  readonly metrics: Metrics;
  readonly wallMs: number;
  readonly shouldShowTimeline: boolean;
}

export function renderReport({ result, metrics, wallMs, shouldShowTimeline }: ReportInput): string {
  const sections = [
    configLines(result.config),
    resultLines(result, metrics, wallMs),
    storyLines(metrics.recoveries),
    invariantLines(metrics.violations),
    ...(shouldShowTimeline ? [timelineLines(result.events)] : []),
  ];
  return sections.map((lines) => lines.join("\n")).join("\n\n");
}
