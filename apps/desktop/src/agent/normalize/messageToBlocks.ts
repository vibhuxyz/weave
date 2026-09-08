import type { GitStatus } from "../../../server/index.ts";
import type { ToolEntry, TurnPlan, TurnUsage } from "../../useAcpChat";
import { explanationFromKnownText } from "./explanation";
import { findingsFromKnownText, makeFinding } from "./finding";
import { projectOverviewFromText } from "./projectOverview";
import { runMetaFromTurn } from "./runMeta";
import { splitSections } from "./sections";
import {
  type AgentBlock,
  type AgentViewModel,
  type BlockSource,
  emptySource,
  type PlanBlock,
  type PlanBlockEntry,
  type SafetyAskBlock,
  type TestRunBlock,
} from "./types";

/**
 * Deterministic presentation adapter.
 *
 * Never calls an LLM. It walks the response section by section — every heading
 * or rule starts a new section — and routes each into the richest block that
 * fits, falling back to markdown so no prose is ever dropped. Tool/test state
 * is derived separately from the tool list.
 */
function planFromText(
  text: string,
  turnId: string,
  source: BlockSource,
): PlanBlock | null {
  const planTagMatch = /<plan>([\s\S]*?)<\/plan>/i.exec(text);
  if (planTagMatch) {
    const rawLines = planTagMatch[1].split("\n");
    const entries: PlanBlockEntry[] = [];
    for (const line of rawLines) {
      const match = /^\s*(?:\d+[.)]|-|\*)\s+(.+)$/.exec(line);
      if (match && match[1].trim()) {
        entries.push({
          id: `step-${entries.length + 1}`,
          content: match[1].trim(),
          priority: "medium",
          status: "pending",
        });
      }
    }
    if (entries.length > 0) {
      return {
        id: `plan-${turnId}`,
        schemaVersion: 1,
        source,
        type: "plan",
        title: "Execution Plan",
        entries,
        turnId,
      };
    }
  }

  const headingMatch =
    /(?:^|\n)##+ (?:Execution Plan|Implementation Plan|Proposed Plan|Plan)\b([\s\S]*?)(?=\n##+ |\n\n\n|$)/i.exec(
      text,
    );
  if (headingMatch) {
    const rawLines = headingMatch[1].split("\n");
    const entries: PlanBlockEntry[] = [];
    for (const line of rawLines) {
      const match = /^\s*(?:\d+[.)]|-|\*)\s+(.+)$/.exec(line);
      if (match && match[1].trim() && !match[1].startsWith("#")) {
        entries.push({
          id: `step-${entries.length + 1}`,
          content: match[1].trim(),
          priority: "medium",
          status: "pending",
        });
      }
    }
    if (entries.length >= 2) {
      return {
        id: `plan-${turnId}`,
        schemaVersion: 1,
        source,
        type: "plan",
        title: "Execution Plan",
        entries,
        turnId,
      };
    }
  }

  return null;
}

/** Loose "numbered or bulleted list" parser — only trusted once we already
 *  know the agent is in plan mode (an ExitPlanMode tool call this turn). */
function planStepsFromText(text: string): PlanBlockEntry[] {
  const entries: PlanBlockEntry[] = [];
  for (const line of text.split("\n")) {
    const match = /^\s*(?:\d+[.)]|[-*])\s+(.+)$/.exec(line);
    const content = match?.[1]?.replace(/^\*\*|\*\*$/g, "").trim();
    if (content && !content.startsWith("#")) {
      entries.push({
        id: `step-${entries.length + 1}`,
        content,
        priority: "medium",
        status: "pending",
      });
    }
  }
  return entries;
}

/** Claude Code plan mode ends with an `ExitPlanMode` tool call; some engines
 *  title it "Approve Plan" / "Present plan". Also treat a write into
 *  `~/.claude/plans/*.md` as the same signal. */
function isPlanModeExit(tools: ToolEntry[]): boolean {
  return tools.some(isPlanModeTool);
}

function isPlanModeTool(t: ToolEntry): boolean {
  const title = t.title.toLowerCase();
  return (
    /\bexit\s?plan\s?mode\b|\bpresent(?:ed|ing)? (?:the )?plan\b|\bapprove plan\b/.test(
      title,
    ) || /\.claude\/plans\/[^\s]*\.md\b/.test(title)
  );
}

/** The full plan markdown — from the `ExitPlanMode` tool's `{ plan }` arg, or
 *  the `{ content }` of the write into `~/.claude/plans/*.md`. Far richer than
 *  the prose summary the agent leaves in the chat message. */
function planTextFromTools(tools: ToolEntry[]): string | null {
  for (const t of tools) {
    if (!isPlanModeTool(t)) continue;
    const raw = t.rawInput;
    if (typeof raw === "string" && raw.trim()) return raw;
    if (raw && typeof raw === "object") {
      const rec = raw as Record<string, unknown>;
      for (const key of ["plan", "content", "text", "markdown"]) {
        if (typeof rec[key] === "string" && (rec[key] as string).trim()) {
          return rec[key] as string;
        }
      }
    }
    if (t.output && t.output.trim().length > 40) return t.output;
  }
  return null;
}

export function messageToBlocks(options: {
  id: string;
  text: string;
  tools: ToolEntry[];
  git: GitStatus;
  status: AgentViewModel["meta"]["status"];
  configValues: Record<string, string>;
  engineId: string;
  engineLabel: string;
  plan?: TurnPlan;
  usage?: TurnUsage;
  sourceEventIds?: string[];
  sourceSeq?: number;
}): AgentViewModel {
  const src = () => emptySource(options.sourceEventIds, options.sourceSeq);
  const sourceRef = sourceFromTurn(options.sourceEventIds, options.sourceSeq);
  const hasCommands = options.tools.some((t) => t.kind === "execute");

  const toolBlocks = options.tools.map((tool) => ({
    id: `tool-${tool.id}`,
    schemaVersion: 1 as const,
    source: emptySource(tool.sourceEventIds, tool.sourceSeq),
    sourceEventIds: tool.sourceEventIds,
    sourceSeq: tool.sourceSeq,
    type: "tool" as const,
    tool,
  }));

  const blocks: AgentBlock[] = [];
  const text = options.text.trim();

  // If a structured plan exists on the turn or can be detected in text, emit it.
  const planModeExit = isPlanModeExit(options.tools);
  if (options.plan && options.plan.entries.length > 0) {
    blocks.push({
      id: `plan-${options.id}`,
      schemaVersion: 1,
      source: src(),
      type: "plan",
      title: "Execution Plan",
      entries: options.plan.entries,
      approved: options.plan.approved,
      awaitingApproval: planModeExit && !options.plan.approved,
      turnId: options.id,
    });
  } else if (planModeExit) {
    // Plan mode with no ACP todo-list: keep the agent's plan markdown intact —
    // the modal renders it as-is — and gate execution on the modal.
    const planText = (planTextFromTools(options.tools) ?? options.text).trim();
    const steps =
      planFromText(planText, options.id, src())?.entries ??
      planStepsFromText(planText);
    blocks.push({
      id: `plan-${options.id}`,
      schemaVersion: 1,
      source: src(),
      type: "plan",
      title: "Execution Plan",
      entries: steps,
      markdown: planText || "The agent proposed a plan but left no details.",
      awaitingApproval: true,
      turnId: options.id,
    });
  } else if (text) {
    const textPlan = planFromText(options.text, options.id, src());
    if (textPlan) {
      blocks.push(textPlan);
    }
  }

  // A safety-ask turn is single-purpose — the whole message is the ask.
  const safetyAsk = text ? safetyAskFromText(options.text, options.tools) : null;

  if (safetyAsk) {
    blocks.push({ ...safetyAsk, source: src() });
  } else if (text) {
    const sections = splitSections(options.text);
    let findingSeq = 0;

    for (const section of sections) {
      const combined = section.heading
        ? `${section.heading}\n${section.body}`
        : section.body;

      // A "Bug #1: …" / "Issue: …" heading is a finding even without a severity
      // keyword — synthesize one from the heading + body.
      const bugHeading = section.heading
        ? /^\s*(?:###?\s*)?(?:\d+\.\s*)?(?:bug|issue|vulnerabilit(?:y|ies)|finding|problem|defect)\b[\s#:\d.-]*(.+)$/i.exec(
            section.heading.replace(/[*_`]/g, ""),
          )
        : null;

      const findings =
        bugHeading && section.body.trim()
          ? [
              makeFinding({
                id: "finding",
                title: bugHeading[1].trim(),
                body: section.body,
                source: sourceRef,
                hasCommands,
              }),
            ]
          : findingsFromKnownText(combined, sourceRef, { hasCommands }).filter(
              // Confidence gate: severity keyword AND a concrete anchor.
              (f) =>
                f.location ||
                f.evidence.length > 0 ||
                f.evidenceCode ||
                /\b(critical|high)\b/i.test(f.severity),
            );

      if (findings.length > 0) {
        for (const f of findings) {
          findingSeq += 1;
          blocks.push({ ...f, id: `finding-${findingSeq}` });
        }
        continue;
      }

      const overview = projectOverviewFromText(combined, sourceRef);
      if (overview) {
        blocks.push({ ...overview, source: src() });
        continue;
      }

      // One Explanation card per turn — a second conceptual section reads better
      // as plain markdown than as another heavy "In one line" block.
      const alreadyExplained = blocks.some((b) => b.type === "explanation");
      const explanation = alreadyExplained
        ? null
        : explanationFromKnownText(section.body, sourceRef, section.heading);
      if (explanation) {
        blocks.push({ ...explanation, id: `explanation-${blocks.length}` });
        continue;
      }

      // Fallback: keep the prose. Re-attach the heading unless the body already
      // opens with it.
      const md =
        section.heading && !section.body.startsWith(section.heading)
          ? `## ${section.heading}\n\n${section.body}`
          : section.body;
      if (md.trim()) {
        blocks.push({
          id: `markdown-${blocks.length}`,
          schemaVersion: 1,
          source: src(),
          sourceEventIds: options.sourceEventIds,
          sourceSeq: options.sourceSeq,
          type: "markdown",
          text: md.trim(),
        });
      }
    }

    // Lead summary only when several findings surfaced.
    const findingBlocks = blocks.filter((b) => b.type === "finding");
    if (findingBlocks.length >= 2) {
      blocks.unshift({
        id: "summary-findings",
        schemaVersion: 1,
        source: src(),
        sourceEventIds: options.sourceEventIds,
        sourceSeq: options.sourceSeq,
        type: "summary",
        label: `${findingBlocks.length} findings`,
        text: summarizeFindings(findingBlocks.length, options.text),
      });
    }
  }

  // Test / RUN LOG card is tool-driven, independent of the text sections.
  const testBlock = testRunFromTools(options.tools);
  if (testBlock) {
    blocks.push({ ...testBlock, source: src() });
    const shown = new Set(testBlock.steps.map((s) => s.id));
    for (let i = toolBlocks.length - 1; i >= 0; i--) {
      if (shown.has(toolBlocks[i].tool.id)) toolBlocks.splice(i, 1);
    }
  }

  blocks.push(...toolBlocks);

  const meta = runMetaFromTurn({
    tools: options.tools,
    git: options.git,
    status: options.status,
    configValues: options.configValues,
    engineId: options.engineId,
    engineLabel: options.engineLabel,
  });

  // Pure post-pass — reads the assembled blocks, sets meta, never reorders.
  meta.problemCount =
    blocks.filter(
      (b) => b.type === "finding" && (b.severity === "critical" || b.severity === "high"),
    ).length +
    (testBlock?.steps.filter((s) => s.status === "failed").length ?? 0);
  meta.changed = meta.filesChanged > 0 || mutatesState(options.tools);

  if (options.usage) {
    const { usage } = options;
    const used = usage.outputTokens ?? usage.contextUsed;
    if (used != null || usage.contextSize != null || usage.costUsd != null) {
      meta.usage = {
        used,
        size: usage.contextSize,
        costUsd: usage.costUsd,
      };
    }
  }

  return {
    schemaVersion: 1,
    id: options.id,
    role: "assistant",
    blocks,
    activity: options.tools.map((tool) => ({
      id: `activity-${tool.id}`,
      schemaVersion: 1,
      source: emptySource(tool.sourceEventIds, tool.sourceSeq),
      sourceEventIds: tool.sourceEventIds,
      sourceSeq: tool.sourceSeq,
      label: tool.title,
      status: tool.status,
      kind: tool.kind,
    })),
    meta,
    rawText: options.text,
    files: [],
    status: options.status,
    sourceEventIds: options.sourceEventIds || [],
  };
}

// Commands that change state. Deliberately requires a mutating *subcommand* —
// `npm --version` / `git status` / `node -v` must not count.
const MUTATING_COMMAND =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:i|install|add|ci|run|exec|create|init|link|uninstall|remove)\b|\bgit\s+(?:commit|add|checkout|switch|merge|rebase|reset|push|pull|stash|apply|clean|rm|mv|init|branch\s+-)\b|\b(?:mkdir|rmdir|rm|mv|cp|touch|ln|chmod|chown|tee|sed\s+-i)\b|>>?\s|\bdocker\s+(?:run|build|compose|rm|exec|start|stop)\b|\bcurl\b[^\n]*\s-X\s*(?:POST|PUT|PATCH|DELETE)|\b(?:migrate|prisma\s+(?:migrate|db|generate)|drizzle-kit)\b/i;

function mutatesState(tools: ToolEntry[]): boolean {
  return tools.some(
    (t) =>
      t.kind === "edit" ||
      t.kind === "delete" ||
      t.kind === "move" ||
      (t.kind === "execute" && MUTATING_COMMAND.test(t.title)),
  );
}

// ── RUN LOG ─────────────────────────────────────────────────────────────

/** Test/HTTP-shaped output that justifies a RUN LOG even for a lone command. */
const RUN_SIGNATURE =
  /\b(?:PASS|FAIL|Tests?:|passing|failing|→\s*\d{3}|HTTP\/\d|status[=:]\s*\d{3}|exit code)\b/i;

interface StepSignal {
  badge?: string;
  badgeTone: "crit" | "ok" | "warn" | "neutral";
  durationMs?: number;
}

export function parseStepSignal(output: string | undefined): StepSignal {
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
    ? dur[2].toLowerCase() === "ms"
      ? Number(dur[1])
      : Math.round(Number(dur[1]) * 1000)
    : undefined;

  return { badge, badgeTone, durationMs };
}

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

function testRunFromTools(tools: ToolEntry[]): TestRunBlock | null {
  const commandTools = tools.filter((tool) => tool.kind === "execute");
  if (commandTools.length === 0) return null;

  const hasRunSignal = commandTools.some((t) => RUN_SIGNATURE.test(t.output ?? ""));
  if (commandTools.length < 2 && !hasRunSignal) return null;

  // Pure exploration — every command is a grep/find/ls with no test-shaped
  // output — is not a "run". Let those render as ordinary tool steps.
  const allSearch = commandTools.every((t) => isSearchOnlyCommand(t.title));
  if (allSearch && !hasRunSignal) return null;

  const failed = commandTools.some(
    (tool) => tool.status === "failed" && !isBenignSearchExit(tool),
  );
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
      output: tool.output,
    };
  });

  const stepHasCrash = steps.some((s) => s.badgeTone === "crit");

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
    status: running ? "running" : failed || stepHasCrash ? "failed" : "passed",
    steps,
    findings: 0,
  };
}

function sourceFromTurn(sourceEventIds?: string[], sourceSeq?: number) {
  const last = sourceEventIds?.at(-1);
  if (!last || sourceSeq === undefined) return undefined;
  const [runId] = last.split(":");
  return runId ? { runId, seq: sourceSeq } : undefined;
}

// ── Safety-ask ──────────────────────────────────────────────────────────

const SAFETY_TRIGGER =
  /before i go further|need the intent|what'?s (?:the|your) (?:context|intent|use case|goal)|stopping to ask|help me understand (?:the|your)/i;

function safetyAskFromText(
  text: string,
  tools: ToolEntry[],
): SafetyAskBlock | null {
  if (!SAFETY_TRIGGER.test(text)) return null;

  const lines = text.split("\n").map((l) => l.trim());
  const first = lines.find(Boolean);

  let actuallyIs: string | undefined;
  const aiIdx = lines.findIndex((l) => /what it actually is/i.test(l));
  if (aiIdx !== -1) actuallyIs = lines.slice(aiIdx + 1).find(Boolean);

  const subtitleMatch = text.match(
    /I'?m not assuming the worst[^.\n]*\.[^\n]*/i,
  );

  return {
    id: "safety-ask",
    schemaVersion: 1,
    source: emptySource(),
    type: "safety-ask",
    title: "Stopping to ask",
    body: first ?? text.trim(),
    actuallyIs,
    actionSubtitle: subtitleMatch ? subtitleMatch[0].trim() : undefined,
    concerns: extractConcernLines(text),
    choices: extractChoices(text),
  };
}

function extractChoices(text: string): string[] {
  const lines = text.split("\n");
  const out: string[] = [];

  // 1. bullet list under a "which of these / options" heading
  const startIdx = lines.findIndex((l) =>
    /which (?:of these|one)|pick the|choose the|options?:|is this (?:a|an|for)/i.test(l),
  );
  if (startIdx !== -1) {
    for (const l of lines.slice(startIdx + 1)) {
      const b = /^[-*]\s+(?:\*\*(.+?)\*\*|(.+?))(?:\s+[—-]\s.*)?$/.exec(l.trim());
      if (b) out.push((b[1] ?? b[2] ?? "").trim());
      else if (out.length && l.trim() === "") break;
      else if (out.length) break;
    }
  }

  // 2. "- **Label** — description" anywhere
  if (out.length === 0) {
    for (const l of lines) {
      const b = /^[-*]\s+\*\*(.+?)\*\*\s+[—-]\s/.exec(l.trim());
      if (b) out.push(b[1].trim());
    }
  }

  // 3. inline "A) … B) …"
  if (out.length === 0) {
    const inline = text.match(/\b[A-D]\)\s*([^\n)]+?)(?=\s+[A-D]\)|\s*$|\n)/g);
    if (inline) for (const m of inline) out.push(m.replace(/^[A-D]\)\s*/, "").trim());
  }

  return out
    .filter((c) => c && c.length <= 80)
    .slice(0, 6);
}

function extractConcernLines(text: string) {
  const lines = text.split("\n");
  const concernHeadingIdx = lines.findIndex((l) =>
    /what concerns me|concerns?:|risks?:|why i'?m asking/i.test(l.trim()),
  );
  const choiceHeadingIdx = lines.findIndex((l) =>
    /which (?:of these|one)|pick the|options?:/i.test(l.trim()),
  );

  const region =
    concernHeadingIdx !== -1
      ? lines.slice(
          concernHeadingIdx + 1,
          choiceHeadingIdx !== -1 ? choiceHeadingIdx : undefined,
        )
      : lines.slice(0, choiceHeadingIdx !== -1 ? choiceHeadingIdx : undefined);

  const out: Array<{ title: string; tag: string; evidence?: string }> = [];
  region.forEach((raw, i) => {
    const l = raw.trim();
    const b = /^(?:\d+[.)]\s+|[-*]\s+)(.+)$/.exec(l);
    if (!b) return;
    const title = b[1].replace(/\*\*/g, "").trim();
    if (title.length < 6) return;
    const inlineCode = /`([^`]+)`/.exec(title);
    const nextIndented = /^\s{2,}\S/.test(region[i + 1] ?? "")
      ? region[i + 1].trim()
      : undefined;
    out.push({
      title: title.slice(0, 160),
      tag: inferConcernTag(title),
      evidence: inlineCode?.[1] ?? nextIndented,
    });
  });
  return out.slice(0, 6);
}

function inferConcernTag(line: string): string {
  if (/password|credential|secret|api[_ ]?key|token/i.test(line)) return "credentials";
  if (/auth|bypass|unauthenticated|no session|permission/i.test(line)) return "auth";
  if (/swift|wise|brand|impersonat|logo/i.test(line)) return "impersonation";
  if (/fabricat|fake|invented|forged|public link/i.test(line)) return "fabricated data";
  if (/inject|xss|csrf|rce|traversal/i.test(line)) return "injection";
  if (/scrap|scale|mass|bulk/i.test(line)) return "scale";
  return "concern";
}

function summarizeFindings(count: number, text: string): string {
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find(
      (line) =>
        line.length > 20 && !/^(#|[-*]|\d+\.|critical|high|medium|low|info)\b/i.test(line),
    );
  return (first ?? `${count} issues found in this pass.`).replace(/\*\*|__|`/g, "");
}
