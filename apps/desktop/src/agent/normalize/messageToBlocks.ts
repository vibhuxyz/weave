import type { GitStatus } from "../../../server/index.ts";
import type { ToolEntry, TurnCheckpoint, TurnPersona, TurnPlan, TurnUsage } from '@/features/chat/hooks';
import { explanationFromKnownText } from "./explanation";
import { findingsFromKnownText, makeFinding } from "./finding";
import {
  isPlanModeExit,
  planFromText,
  planStepsFromText,
  planTextFromTools,
} from "./messageToBlocks/planDetection";
import { safetyAskFromText } from "./messageToBlocks/safetyAsk";
import { testRunFromTools } from "./messageToBlocks/testRun";
import {
  mutatesState,
  sourceFromTurn,
  summarizeFindings,
} from "./messageToBlocks/turnAnalysis";
import { projectOverviewFromText } from "./projectOverview";
import { runMetaFromTurn } from "./runMeta";
import { splitSections } from "./sections";
import {
  type AgentBlock,
  type AgentViewModel,
  emptySource,
} from "./types";

/**
 * Deterministic presentation adapter.
 *
 * Never calls an LLM. It walks the response section by section — every heading
 * or rule starts a new section — and routes each into the richest block that
 * fits, falling back to markdown so no prose is ever dropped. Tool/test state
 * is derived separately from the tool list.
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
  personas?: TurnPersona[];
  plan?: TurnPlan;
  usage?: TurnUsage;
  sourceEventIds?: string[];
  sourceSeq?: number;
  /** Set by the server after a Stop sequence checkpoint (CONTINUATION.md §8).
   * Renders the CheckpointBlock "Continue with…" UI. */
  checkpoint?: TurnCheckpoint;
  /** Installed engines other than the one running this turn, for the
   * checkpoint's "Continue with" buttons. */
  otherEngines?: { id: string; label: string }[];
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
                title: (bugHeading[1] ?? "").trim(),
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
      const toolBlock = toolBlocks[i];
      if (toolBlock && shown.has(toolBlock.tool.id)) toolBlocks.splice(i, 1);
    }
  }

  blocks.push(...toolBlocks);

  if (options.checkpoint) {
    const cp = options.checkpoint;
    blocks.push({
      id: `checkpoint-${cp.checkpointId}`,
      schemaVersion: 1,
      source: src(),
      type: "checkpoint",
      mode: "handoff",
      reason: cp.reason,
      checkpointId: cp.checkpointId,
      summary: cp.summary,
      availableEngines: options.otherEngines ?? [],
    });
  }

  const meta = runMetaFromTurn({
    tools: options.tools,
    git: options.git,
    status: options.status,
    configValues: options.configValues,
    engineId: options.engineId,
    engineLabel: options.engineLabel,
    personas: options.personas,
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
    // Two independent channels: the live context window (`usage_update`) and
    // the turn totals on the prompt response. Engines report either, both, or
    // neither — keep whatever arrived and let the header decide what to show.
    const reported =
      usage.contextUsed != null ||
      usage.contextSize != null ||
      usage.totalTokens != null ||
      usage.inputTokens != null ||
      usage.outputTokens != null ||
      usage.costUsd != null;
    if (reported) {
      meta.usage = {
        used: usage.contextUsed,
        size: usage.contextSize,
        costUsd: usage.costUsd,
        totalTokens: usage.totalTokens,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        thoughtTokens: usage.thoughtTokens,
        cachedReadTokens: usage.cachedReadTokens,
        cachedWriteTokens: usage.cachedWriteTokens,
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
