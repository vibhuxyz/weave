import type { GitStatus } from "../../../server/index.ts";
import type { ToolEntry } from "../../useAcpChat";
import { explanationFromKnownText } from "./explanation";
import { findingsFromKnownText } from "./finding";
import { runMetaFromTurn } from "./runMeta";
import type { AgentBlock, AgentViewModel } from "./types";

/**
 * Deterministic presentation adapter.
 *
 * This must not call an LLM. It uses structured ACP/tool/git state first,
 * controlled response shapes second, and falls back to Markdown for everything
 * else so an unknown agent response still renders.
 */
export function messageToBlocks(options: {
  id: string;
  text: string;
  tools: ToolEntry[];
  git: GitStatus;
  status: AgentViewModel["meta"]["status"];
  configValues: Record<string, string>;
  engineId: string;
  engineLabel: string;
  sourceEventIds?: string[];
  sourceSeq?: number;
}): AgentViewModel {
  const blocks: AgentBlock[] = [];
  const toolBlocks = options.tools.map<AgentBlock>((tool) => ({
    id: `tool-${tool.id}`,
    schemaVersion: 1,
    sourceEventIds: tool.sourceEventIds,
    sourceSeq: tool.sourceSeq,
    type: "tool",
    tool,
  }));

  const testBlock = testRunFromTools(options.tools);
  if (testBlock) {
    blocks.push(testBlock);
  }

  const safetyAsk = safetyAskFromText(options.text);
  if (safetyAsk) {
    blocks.push(safetyAsk);
  } else {
    const source = sourceFromTurn(options.sourceEventIds, options.sourceSeq);
    const findings = findingsFromKnownText(options.text, source);
    const explanation = explanationFromKnownText(options.text, source);

    if (findings.length > 0) {
      blocks.push({
        id: "summary-findings",
        schemaVersion: 1,
        sourceEventIds: options.sourceEventIds,
        sourceSeq: options.sourceSeq,
        type: "summary",
        label: `${findings.length} finding${findings.length === 1 ? "" : "s"}`,
        text: summarizeFindings(findings.length, options.text),
      });
      blocks.push(...findings);
    } else if (explanation) {
      blocks.push(explanation);
    }
  }

  blocks.push(...toolBlocks);

  if (blocks.length === toolBlocks.length && options.text.trim()) {
    blocks.unshift({
      id: "markdown-main",
      schemaVersion: 1,
      sourceEventIds: options.sourceEventIds,
      sourceSeq: options.sourceSeq,
      type: "markdown",
      text: options.text,
    });
  }

  return {
    schemaVersion: 1,
    id: options.id,
    role: "assistant",
    blocks,
    activity: options.tools.map((tool) => ({
      id: `activity-${tool.id}`,
      schemaVersion: 1,
      sourceEventIds: tool.sourceEventIds,
      sourceSeq: tool.sourceSeq,
      label: tool.title,
      status: tool.status,
      kind: tool.kind,
    })),
    meta: runMetaFromTurn({
      tools: options.tools,
      git: options.git,
      status: options.status,
      configValues: options.configValues,
      engineId: options.engineId,
      engineLabel: options.engineLabel,
    }),
    rawText: options.text,
  };
}

function testRunFromTools(tools: ToolEntry[]): AgentBlock | null {
  const commandTools = tools.filter((tool) => tool.kind === "execute");
  if (commandTools.length < 2) return null;
  const failed = commandTools.some((tool) => tool.status === "failed");
  const running = commandTools.some(
    (tool) => tool.status === "pending" || tool.status === "in_progress",
  );

  return {
    id: "test-run",
    schemaVersion: 1,
    sourceEventIds: commandTools.flatMap((tool) => tool.sourceEventIds ?? []),
    sourceSeq: commandTools.at(-1)?.sourceSeq,
    type: "test",
    title: "Test run",
    status: running ? "running" : failed ? "failed" : "passed",
    steps: commandTools.map((tool) => ({
      id: tool.id,
      label: tool.title,
      status: tool.status,
      kind: tool.kind,
    })),
    findings: 0,
  };
}

function sourceFromTurn(sourceEventIds?: string[], sourceSeq?: number) {
  const last = sourceEventIds?.at(-1);
  if (!last || sourceSeq === undefined) return undefined;
  const [runId] = last.split(":");
  return runId ? { runId, seq: sourceSeq } : undefined;
}

function safetyAskFromText(text: string): AgentBlock | null {
  if (!/before i go further|need the intent|what'?s the context|stopping to ask/i.test(text)) {
    return null;
  }

  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return {
    id: "safety-ask",
    schemaVersion: 1,
    type: "safety-ask",
    title: "Stopping to ask",
    body: first ?? text.trim(),
    concerns: extractConcernLines(text),
    choices: [
      "Internal ops prototype",
      "Class demo",
      "Authorized red-team",
      "Something else",
    ],
  };
}

function extractConcernLines(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);

  return lines
    .filter((line) => /\b(password|credential|auth|fake|fabricat|brand|swift|wise|public link|bypass)\b/i.test(line))
    .slice(0, 4)
    .map((line) => ({
      title: line.slice(0, 120),
      tag: inferConcernTag(line),
    }));
}

function inferConcernTag(line: string): string {
  if (/password|credential/i.test(line)) return "credentials";
  if (/auth|bypass/i.test(line)) return "auth";
  if (/swift|wise|brand/i.test(line)) return "impersonation";
  if (/fake|fabricat|public link/i.test(line)) return "fabricated data";
  return "concern";
}

function summarizeFindings(count: number, text: string): string {
  const first = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !/^(critical|high|medium|low)\b/i.test(line));
  return first ?? `I found ${count} issue${count === 1 ? "" : "s"}.`;
}
