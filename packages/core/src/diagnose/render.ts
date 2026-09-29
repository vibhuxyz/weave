import type { RunDiagnosis, TaskDiagnosis } from "./types.ts";

const MAX_REASON_CHARS = 400;
const MAX_LISTED_ERRORS = 3;
const MS_PER_SECOND = 1000;
const NO_REASON = "no reason was recorded — the engine failed without reporting one";

function seconds(ms: number): string {
  return `${(ms / MS_PER_SECOND).toFixed(1)}s`;
}

function short(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_REASON_CHARS ? `${flat.slice(0, MAX_REASON_CHARS)}…` : flat;
}

function share(part: number, whole: number): string {
  return whole === 0 ? "0%" : `${Math.round((part / whole) * 100)}%`;
}

function failureLines(task: TaskDiagnosis): readonly string[] {
  const lines = [`  ${task.taskId} — ${task.status} after ${seconds(task.wallMs)}, ${task.attempts} attempt(s) on ${task.engines.join(", ") || "no engine"}`];
  lines.push(`    why: ${task.reason === null ? NO_REASON : short(task.reason)}`);
  for (const timeout of task.timeouts) {
    lines.push(`    timeout: ${timeout.reason} after ${timeout.turns} turns (${seconds(timeout.wallMs)})`);
  }
  for (const failed of task.verifications.filter((entry) => !entry.ok)) {
    lines.push(`    failed check: ${failed.rung} (${seconds(failed.wallMs)})`);
  }
  for (const error of task.errors.slice(0, MAX_LISTED_ERRORS)) {
    lines.push(`    error in ${error.where}: ${short(error.message)}`);
  }
  if (task.errors.length > MAX_LISTED_ERRORS) {
    lines.push(`    (+${task.errors.length - MAX_LISTED_ERRORS} more errors)`);
  }
  return lines;
}

function timingLines(task: TaskDiagnosis): string {
  const other = Math.max(0, task.wallMs - task.installMs - task.agentMs);
  return [
    `  ${task.taskId.padEnd(10)} ${seconds(task.wallMs).padStart(8)}`,
    `install ${seconds(task.installMs)} (${share(task.installMs, task.wallMs)})`,
    `agent ${seconds(task.agentMs)} (${share(task.agentMs, task.wallMs)})`,
    `other ${seconds(other)}`,
    `${task.toolCalls} tool calls`,
    `${task.filesWritten} writes`,
  ].join(" · ");
}

export function renderDiagnosis(diagnosis: RunDiagnosis): string {
  const lines: string[] = [
    `Run ${diagnosis.runId} — ${diagnosis.status} in ${seconds(diagnosis.wallMs)}`,
    `${diagnosis.tasks.length} task(s), ${diagnosis.failed.length} not ok, ${diagnosis.eventCount} events, $${diagnosis.costUsd.toFixed(4)}`,
    "",
  ];

  lines.push(diagnosis.failed.length === 0 ? "Every task finished ok." : "Why workers failed");
  for (const task of diagnosis.failed) lines.push(...failureLines(task));
  lines.push("");

  lines.push("Where the time went");
  for (const task of diagnosis.slowest) lines.push(timingLines(task));

  const slowChecks = diagnosis.tasks
    .flatMap((task) => task.verifications.map((entry) => ({ taskId: task.taskId, ...entry })))
    .sort((a, b) => b.wallMs - a.wallMs)
    .slice(0, MAX_LISTED_ERRORS);
  if (slowChecks.length > 0) {
    lines.push("", "Slowest checks");
    for (const check of slowChecks) {
      lines.push(`  ${check.taskId} ${check.rung} ${seconds(check.wallMs)} ${check.ok ? "ok" : "FAILED"}`);
    }
  }

  if (diagnosis.runErrors.length > 0) {
    lines.push("", "Run errors");
    for (const error of diagnosis.runErrors) lines.push(`  ${error.where}: ${short(error.message)}`);
  }

  return lines.join("\n");
}
