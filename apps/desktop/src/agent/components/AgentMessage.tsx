import { useMemo, useState } from "react";
import type { GitStatus } from "../../../server/index.ts";
import { useCopyToClipboard } from "../../hooks/use-copy-to-clipboard";
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
import { tabBlocks, type AgentTab } from "./AgentTabs";
import { BlockErrorBoundary } from "./BlockErrorBoundary";
import { CheckpointBlock } from "./CheckpointBlock";
import { EvidenceBlock } from "./EvidenceBlock";
import { ProjectOverviewBlockView } from "./ProjectOverviewBlock";

const TABS: Array<{ id: AgentTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "files", label: "Files" },
  { id: "git", label: "Git" },
];

/** Block types the depth toggle actually filters — see filterBlocksByDepth. */
const DEPTH_BLOCK_TYPES = new Set<AgentBlock["type"]>([
  "summary",
  "finding",
  "explanation",
  "project-overview",
  "safety-ask",
  "code",
  "diff",
  "test",
]);

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
}) {
  const [tab, setTab] = useState<AgentTab>("overview");
  const [depth, setDepth] = useState<DepthLevel>("normal");
  const { copyToClipboard } = useCopyToClipboard();
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
      turn.sourceEventIds,
      turn.sourceSeq,
      turn.text,
      turn.tools,
    ],
  );

  const stopRun = onAction ? () => onAction({ type: "cancel_run" }) : undefined;
  const toolStepBlocks = viewModel.blocks.filter(
    (block): block is Extract<AgentBlock, { type: "tool" }> => block.type === "tool",
  );

  // Which tabs actually have something. Overview always; the rest only when
  // populated, so a plain answer doesn't sprout four empty tabs.
  const availableTabs = TABS.filter((t) => {
    if (t.id === "overview") return true;
    if (t.id === "activity") return viewModel.activity.length > 0;
    return git.changes.length > 0; // files + git
  });
  const activeTab = availableTabs.some((t) => t.id === tab) ? tab : "overview";

  const rawVisibleBlocks = tabBlocks({
    tab: activeTab,
    overview: viewModel.blocks,
    activity: viewModel.activity,
    git,
  });
  const visibleBlocks =
    activeTab === "overview"
      ? filterBlocksByDepth(rawVisibleBlocks, depth)
      : rawVisibleBlocks;
  const bodyBlocks =
    activeTab === "overview"
      ? visibleBlocks.filter((b) => b.type !== "tool")
      : visibleBlocks;

  const hasBody = bodyBlocks.length > 0 || viewModel.rawText.trim().length > 0;
  const showDepth = viewModel.blocks.some((b) => DEPTH_BLOCK_TYPES.has(b.type));

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
    <article className="dark w-full overflow-hidden rounded-xl border border-agent-border bg-agent-surface-base text-agent-text shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      {stepStrip && (
        <div className="border-agent-border border-b bg-agent-surface-raised px-5 py-3">
          {stepStrip}
        </div>
      )}
      <AgentHeader
        meta={viewModel.meta}
        depth={depth}
        onDepthChange={setDepth}
        showDepth={showDepth}
        onCopy={() => copyToClipboard(viewModel.rawText)}
      />
      {availableTabs.length > 1 && (
        <div className="flex items-center gap-1 border-agent-border border-b bg-agent-surface-raised px-5 py-2">
          {availableTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={
                activeTab === item.id
                  ? "rounded-md bg-agent-surface-hover px-3 py-1 text-xs text-agent-text-bright"
                  : "rounded-md px-3 py-1 text-agent-text-faint text-xs hover:text-agent-text-bright"
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-5 bg-[linear-gradient(180deg,var(--agent-accent-wash),transparent_200px)] p-5">
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
          )
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
            content = <TestRunBlock key={block.id} block={block} />;
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
          default:
            return null;
        }

        return <BlockErrorBoundary key={block.id}>{content}</BlockErrorBoundary>;
      })}
    </>
  );
}
