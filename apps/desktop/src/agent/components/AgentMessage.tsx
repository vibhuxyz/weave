import { useMemo } from "react";
import { cn } from "@/shared/lib/cn";
import type { GitStatus } from "../../../server/index.ts";
import type { ChatTurn } from "../../useAcpChat";
import { type AgentBlock, type BlockAction, emptySource } from "../normalize/types";
import { messageToBlocks } from "../normalize/messageToBlocks";
import { AgentHeader, type DepthLevel } from "./AgentHeader";
import { CodeBlockView } from "./CodeBlockView";
import { DiffBlock } from "./DiffBlock";
import { ErrorBlock } from "./ErrorBlock";
import { ExplanationBlock } from "./ExplanationBlock";
import { FileChangeBlock } from "./FileChangeBlock";
import { FindingCard } from "./FindingCard";
import { MarkdownBlock } from "./MarkdownBlock";
import { PermissionBlock } from "./PermissionBlock";
import { SafetyAskBlock } from "./SafetyAskBlock";
import { SummaryBlock } from "./SummaryBlock";
import { TestRunBlock } from "./TestRunBlock";
import { ToolStepBlock } from "./ToolStepBlock";
import { BlockErrorBoundary } from "./BlockErrorBoundary";
import { CheckpointBlock } from "./CheckpointBlock";
import { EvidenceBlock } from "./EvidenceBlock";
import { ProjectOverviewBlockView } from "./ProjectOverviewBlock";
import { PlanBlockView } from "./PlanBlockView";
import { TurnDiffBar } from "./TurnDiffBar";
import { WorkingRow } from "./WorkingRow";
import { turnDiff } from "../diff/turnDiff";
import type { TurnPlan } from "../../useAcpChat";

/** Filter blocks by presentation depth — no re-normalization, purely visual. */
function filterBlocksByDepth(blocks: AgentBlock[], depth: DepthLevel): AgentBlock[] {
  if (depth === "normal") return blocks;
  if (depth === "brief") {
    // Brief: show only the headline-level blocks — no tool steps, no code, no diffs
    return blocks.filter(
      (b) =>
        b.type === "summary" ||
        b.type === "finding" ||
        b.type === "explanation" ||
        b.type === "project-overview" ||
        b.type === "safety-ask" ||
        b.type === "plan" ||
        b.type === "markdown",
    );
  }
  // Deep: show everything (same as normal for now; individual block components
  // can read depth to expand evidence/details when passed as a prop later)
  return blocks;
}

export function AgentMessage({
  turn,
  projectDir,
  git,
  configValues,
  engineId,
  engineLabel,
  running,
  onAction,
  onSend,
  onUpdatePlan,
  onExitPlanMode,
  onOpenDiff,
  diffOpen,
  depth = "normal",
}: {
  turn: ChatTurn;
  projectDir: string | null;
  git: GitStatus;
  configValues: Record<string, string>;
  engineId: string;
  engineLabel: string;
  running: boolean;
  onAction?: (action: BlockAction) => void;
  onSend?: (text: string) => void;
  onUpdatePlan?: (turnId: string, plan: TurnPlan) => void;
  /** Take the engine out of plan mode — called when a plan is approved. */
  onExitPlanMode?: () => void;
  /** Hand this turn's file changes to the side panel, optionally one file. */
  onOpenDiff?: (path?: string) => void;
  /** The side panel is currently showing this turn's diff. */
  diffOpen?: boolean;
  /** How much of the run to render — set from the composer. */
  depth?: DepthLevel;
}) {
  const viewModel = useMemo(
    () =>
      messageToBlocks({
        id: turn.id,
        text: turn.text,
        tools: turn.tools,
        git,
        status: running ? "running" : "completed",
        configValues,
        engineId,
        engineLabel,
        personas: turn.personas,
        plan: turn.plan,
        usage: turn.usage,
        sourceEventIds: turn.sourceEventIds,
        sourceSeq: turn.sourceSeq,
      }),
    [
      configValues,
      engineId,
      engineLabel,
      git,
      running,
      turn.id,
      turn.personas,
      turn.plan,
      turn.usage,
      turn.sourceEventIds,
      turn.sourceSeq,
      turn.text,
      turn.tools,
    ],
  );

  const diff = useMemo(() => turnDiff(turn), [turn.tools]);

  const stopRun = onAction ? () => onAction({ type: "cancel_run" }) : undefined;
  const toolStepBlocks = viewModel.blocks.filter(
    (block): block is Extract<AgentBlock, { type: "tool" }> => block.type === "tool",
  );

  // One surface, no tab layer: the run card is the run. Files and git state
  // live in the right-hand inspector.
  const bodyBlocks = filterBlocksByDepth(viewModel.blocks, depth).filter(
    (b) => b.type !== "tool",
  );

  const hasBody = bodyBlocks.length > 0 || viewModel.rawText.trim().length > 0;

  const stepStrip =
    toolStepBlocks.length > 0 ? (
      <BlockErrorBoundary>
        <ToolStepBlock
          blocks={toolStepBlocks}
          projectDir={projectDir}
          onStop={stopRun}
        />
      </BlockErrorBoundary>
    ) : null;

  // Nothing to frame yet — the agent is still working. Show just the live
  // steps; the header + tabs materialise once there's an answer.
  if (!hasBody) {
    if (!stepStrip) return null;
    return (
      <div className="dark w-full rounded-xl border border-agent-border bg-agent-surface-raised p-4 text-agent-text">
        {stepStrip}
      </div>
    );
  }

  return (
    <article className="dark flex w-full flex-col overflow-hidden rounded-xl border border-agent-border bg-agent-surface-base text-agent-text shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      {stepStrip && (
        <div className="border-agent-border border-b bg-agent-surface-raised px-4 py-2.5">
          {stepStrip}
        </div>
      )}
      <AgentHeader meta={viewModel.meta} engineId={engineId} />
      {running && <WorkingRow turn={turn} projectDir={projectDir} />}
      <div className="space-y-4 p-4">
        {bodyBlocks.length === 0 ? (
          <MarkdownBlock
            block={{
              id: "empty-markdown",
              schemaVersion: 1,
              source: emptySource(),
              type: "markdown",
              text: viewModel.rawText,
            }}
          />
        ) : (
          renderBlocks(
            bodyBlocks,
            projectDir,
            onAction,
            onSend,
            depth,
            viewModel.meta.changed,
            engineLabel,
            onUpdatePlan,
            onExitPlanMode,
            stopRun,
          )
        )}
        {diff.files.length > 0 && (
          <BlockErrorBoundary>
            <TurnDiffBar
              diff={diff}
              onOpenDiff={onOpenDiff}
              active={diffOpen}
              projectDir={projectDir}
            />
          </BlockErrorBoundary>
        )}
      </div>
    </article>
  );
}

function renderBlocks(
  blocks: AgentBlock[],
  projectDir: string | null,
  onAction?: (action: BlockAction) => void,
  onSend?: (text: string) => void,
  depth?: "brief" | "normal" | "deep",
  changed?: boolean,
  engineLabel?: string,
  onUpdatePlan?: (turnId: string, plan: TurnPlan) => void,
  onExitPlanMode?: () => void,
  onStop?: () => void,
) {
  const toolBlocks = blocks.filter(
    (block): block is Extract<AgentBlock, { type: "tool" }> =>
      block.type === "tool",
  );
  const nonToolBlocks = blocks.filter((block) => block.type !== "tool");

  return (
    <>
      {toolBlocks.length > 0 && (
        <BlockErrorBoundary>
          <ToolStepBlock blocks={toolBlocks} projectDir={projectDir} />
        </BlockErrorBoundary>
      )}
      {nonToolBlocks.map((block) => {
        let content = null;
        switch (block.type) {
          case "summary":
            content = <SummaryBlock key={block.id} block={block} />;
            break;
          case "markdown":
            content = <MarkdownBlock key={block.id} block={block} />;
            break;
          case "explanation":
            content = <ExplanationBlock key={block.id} block={block} />;
            break;
          case "finding":
            content = <FindingCard key={block.id} block={block} onAction={onAction} />;
            break;
          case "code":
            content = <CodeBlockView key={block.id} block={block} />;
            break;
          case "diff":
            content = <DiffBlock key={block.id} block={block} />;
            break;
          case "test":
            content = <TestRunBlock key={block.id} block={block} onSend={onSend} />;
            break;
          case "error":
            content = <ErrorBlock key={block.id} block={block} />;
            break;
          case "permission":
            content = <PermissionBlock key={block.id} block={block} />;
            break;
          case "file-change":
            content = <FileChangeBlock key={block.id} block={block} />;
            break;
          case "safety-ask":
            content = <SafetyAskBlock key={block.id} block={block} onSend={onSend} changed={changed} />;
            break;
          case "evidence":
            content = <EvidenceBlock key={block.id} block={block} onAction={onAction} depth={depth} />;
            break;
          case "checkpoint":
            content = <CheckpointBlock key={block.id} block={block} onAction={onAction} />;
            break;
          case "project-overview":
            content = <ProjectOverviewBlockView key={block.id} block={block} />;
            break;
          case "plan":
            content = (
              <PlanBlockView
                key={block.id}
                block={block}
                engineLabel={engineLabel}
                onSend={onSend}
                onExitPlanMode={onExitPlanMode}
                onStop={onStop}
                onUpdatePlan={(plan) =>
                  onUpdatePlan?.(block.turnId ?? block.id, plan)
                }
              />
            );
            break;
          default:
            return null;
        }

        return <BlockErrorBoundary key={block.id}>{content}</BlockErrorBoundary>;
      })}
    </>
  );
}
