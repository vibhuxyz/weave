import type { ToolEntry } from "@/features/chat/hooks";
import { emptySource } from "../types";
import type { TestRunBlock } from "../types";

interface StepSignal {
  badge?: string;
  badgeTone: "crit" | "ok" | "warn" | "neutral";
  durationMs?: number;
}

function parseStepSignal(output: string | undefined): StepSignal {
  if (!output) return { badgeTone: "neutral" };
  const o = output;

  let badge: string | undefined;
  let badgeTone: StepSignal["badgeTone"] = "neutral";

  const http = /(?:→|->|status[=:]\s*|HTTP\/\d(?:\.\d)?\s+)(\d{3})\b/.exec(o);
  if (http) {
    const code = Number(http[1]);
    if (code >= 500) (badge = `${code} crash`), (badgeTone = "crit");
    else if (code >= 400) (badge = `${code}`), (badgeTone = "warn");
    else if (code === 201) (badge = "201 created"), (badgeTone = "ok");
    else if (code >= 200) (badge = `${code} ok`), (badgeTone = "ok");
  }

  const failed = /(\d+)\s+(?:tests?\s+)?fail(?:ed|ing)/i.exec(o);
  if (failed && Number(failed[1]) > 0) {
    badge = `${failed[1]} failed`;
    badgeTone = "crit";
  } else if (!badge && /\ball (?:tests? )?pass(?:ed|ing)?\b|\bPASS\b|✓/i.test(o)) {
    badge = "passed";
    badgeTone = "ok";
  }

  const exit = /\bexit(?:\s+code)?\s+(\d+)/i.exec(o);
  if (exit) {
    if (exit[1] === "0" && !badge) (badge = "ok"), (badgeTone = "ok");
    else if (exit[1] !== "0") (badge = `exit ${exit[1]}`), (badgeTone = "crit");
  }

  const dur =
    /\bin\s+(\d+(?:\.\d+)?)\s*(m?s)\b/i.exec(o) ??
    /\((\d+(?:\.\d+)?)\s*(m?s)\)/i.exec(o) ??
    /\bTime:\s*(\d+(?:\.\d+)?)\s*(m?s)\b/i.exec(o);
  const durationMs = dur
    ? dur[2]?.toLowerCase() === "ms"
      ? Number(dur[1])
      : Math.round(Number(dur[1]) * 1000)
    : undefined;

  return { badge, badgeTone, durationMs };
}

/**
 * Output that reports a test result. Narrower than RUN_SIGNATURE on purpose: an
 * HTTP 200 says nothing about whether a failing suite was put right.
 */
const TEST_SIGNATURE =
  /\b(?:PASS|FAIL|Tests?:|\d+\s+(?:tests?\s+)?(?:pass|fail)(?:ed|ing)?|passing|failing)\b/i;

/** Test/HTTP-shaped output that justifies a RUN LOG even for a lone command. */
const RUN_SIGNATURE =
  /\b(?:PASS|FAIL|Tests?:|passing|failing|→\s*\d{3}|HTTP\/\d|status[=:]\s*\d{3}|exit code)\b/i;

// Search / inspection commands that use a non-zero exit as an ordinary
// "no match" / "differs" result, not an error. `grep foo` with no hit exits 1;
// that is not a failing step and must not turn a run red.
const SEARCH_COMMAND =
  /^(?:grep|egrep|fgrep|rg|ag|ack|find|fd|diff|cmp|test|\[|ls|cat|head|tail|wc|sed|awk|jq|rev|sort|uniq|comm|which|type|command|pgrep)$/;
const PASSTHROUGH_COMMAND = /^(?:cd|echo|true|false|pwd|export|set|:)$/;
// Output that means the shell itself failed, not just an empty result.
const REAL_SHELL_ERROR =
  /\b(?:command not found|permission denied|killed|segmentation fault|cannot execute|not a directory|too many open files|out of memory)\b/i;

/** Every &&/||/;/| segment is a search or passthrough command. */
function isSearchOnlyCommand(title: string): boolean {
  const segments = title.split(/&&|\|\||[;|]/).map((s) => s.trim());
  if (segments.length === 0) return false;
  return segments.every((seg) => {
    const word = seg.replace(/^\S+=\S+\s+/, "").split(/\s+/)[0]?.replace(/.*\//, "");
    return !word || SEARCH_COMMAND.test(word) || PASSTHROUGH_COMMAND.test(word);
  });
}

/** A "failed" execute tool that is really just an empty search result. */
function isBenignSearchExit(tool: ToolEntry): boolean {
  if (tool.status !== "failed") return false;
  if (REAL_SHELL_ERROR.test(tool.output ?? "")) return false;
  if (!isSearchOnlyCommand(tool.title)) return false;
  const exit = /\bexit(?:\s+code)?\s+(\d+)/i.exec(tool.output ?? "");
  // grep/diff use exit 1; exit ≥ 3 is always a real error. Missing code (the
  // engine just flagged the tool) is treated as benign for a search command.
  return !exit || Number(exit[1]) <= 2;
}

function isTestShaped(tool: ToolEntry): boolean {
  return TEST_SIGNATURE.test(tool.output ?? "");
}

/**
 * Which failing steps a later test run has already answered.
 *
 * An agent that runs the suite, fixes what broke and runs it again leaves a red
 * row behind it. The row stays — it happened — but it is no longer the state of
 * the branch, so it must not keep asking to be retried.
 *
 * Only a test failure can be superseded, and only by a later passing test: a
 * green build says nothing about a red suite.
 */
function supersededStepIds(tools: readonly ToolEntry[]): ReadonlySet<string> {
  const superseded = new Set<string>();
  for (const [index, tool] of tools.entries()) {
    if (tool.status !== "failed" || isBenignSearchExit(tool) || !isTestShaped(tool)) continue;
    const answered = tools
      .slice(index + 1)
      .some((later) => later.status === "completed" && isTestShaped(later));
    if (answered) superseded.add(tool.id);
  }
  return superseded;
}

export function testRunFromTools(tools: ToolEntry[]): TestRunBlock | null {
  const commandTools = tools.filter((tool) => tool.kind === "execute");
  if (commandTools.length === 0) return null;

  const hasRunSignal = commandTools.some((t) => RUN_SIGNATURE.test(t.output ?? ""));
  if (commandTools.length < 2 && !hasRunSignal) return null;

  // Pure exploration — every command is a grep/find/ls with no test-shaped
  // output — is not a "run". Let those render as ordinary tool steps.
  const allSearch = commandTools.every((t) => isSearchOnlyCommand(t.title));
  if (allSearch && !hasRunSignal) return null;

  const superseded = supersededStepIds(commandTools);
  const failures = commandTools.filter(
    (tool) => tool.status === "failed" && !isBenignSearchExit(tool),
  );
  const outstanding = failures.filter((tool) => !superseded.has(tool.id));
  const running = commandTools.some(
    (tool) => tool.status === "pending" || tool.status === "in_progress",
  );

  const steps = commandTools.map((tool) => {
    const sig = parseStepSignal(tool.output);
    const wallMs =
      tool.startedAt != null && tool.endedAt != null
        ? tool.endedAt - tool.startedAt
        : undefined;
    const benign = isBenignSearchExit(tool);
    return {
      id: tool.id,
      label: tool.title,
      status: benign ? ("completed" as const) : tool.status,
      kind: tool.kind,
      durationMs: sig.durationMs ?? wallMs,
      badge: benign ? "no match" : sig.badge,
      badgeTone: benign ? ("neutral" as const) : sig.badgeTone,
      superseded: superseded.has(tool.id),
      output: tool.output,
    };
  });

  const stepHasCrash = steps.some((s) => s.badgeTone === "crit" && !s.superseded);
  const failedNow = outstanding.length > 0 || stepHasCrash;
  const recovered = !failedNow && failures.length > 0;
  const ranTests = commandTools.some(isTestShaped);

  return {
    id: "test-run",
    schemaVersion: 1,
    source: emptySource(
      commandTools.flatMap((tool) => tool.sourceEventIds ?? []),
      commandTools.at(-1)?.sourceSeq,
    ),
    sourceEventIds: commandTools.flatMap((tool) => tool.sourceEventIds ?? []),
    sourceSeq: commandTools.at(-1)?.sourceSeq,
    type: "test",
    title: "Run log",
    status: running ? "running" : failedNow ? "failed" : recovered ? "recovered" : ranTests ? "passed" : "completed",
    steps,
    findings: 0,
  };
}
