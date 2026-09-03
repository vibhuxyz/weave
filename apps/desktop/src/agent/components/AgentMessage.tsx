import { useMemo, useState } from "react";
import type { GitStatus } from "../../../server/index.ts";
import { useCopyToClipboard } from "../../hooks/use-copy-to-clipboard";
import type { ChatTurn } from "../../useAcpChat";
import type { AgentBlock } from "../normalize/types";
import { messageToBlocks } from "../normalize/messageToBlocks";
import { AgentHeader } from "./AgentHeader";
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

const TABS: Array<{ id: AgentTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "activity", label: "Activity" },
  { id: "files", label: "Files" },
  { id: "git", label: "Git" },
];

export function AgentMessage({
  turn,
  projectDir,
  git,
  configValues,
  engineId,
  engineLabel,
  running,
}: {
  turn: ChatTurn;
  projectDir: string | null;
  git: GitStatus;
  configValues: Record<string, string>;
  engineId: string;
  engineLabel: string;
  running: boolean;
}) {
  const [tab, setTab] = useState<AgentTab>("overview");
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

  const visibleBlocks = tabBlocks({
    tab,
    overview: viewModel.blocks,
    activity: viewModel.activity,
    git,
  });

  return (
    <article className="w-full overflow-hidden rounded-xl border border-white/10 bg-[#14141b] shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
      <AgentHeader
        meta={viewModel.meta}
        onCopy={() => copyToClipboard(viewModel.rawText)}
      />
      <div className="flex items-center gap-1 border-white/10 border-b bg-[#171720] px-5 py-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? "rounded-md bg-[#272636] px-3 py-1 text-xs text-white"
                : "rounded-md px-3 py-1 text-[#8e8b98] text-xs hover:text-white"
            }
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="space-y-5 bg-[linear-gradient(180deg,rgba(255,122,82,0.035),rgba(20,20,27,0)_180px)] p-5">
        {visibleBlocks.length === 0 ? (
          <MarkdownBlock
            block={{
              id: "empty-markdown",
              schemaVersion: 1,
              type: "markdown",
              text: viewModel.rawText,
            }}
          />
        ) : (
          renderBlocks(visibleBlocks, projectDir)
        )}
      </div>
    </article>
  );
}

function renderBlocks(blocks: AgentBlock[], projectDir: string | null) {
  const toolBlocks = blocks.filter(
    (block): block is Extract<AgentBlock, { type: "tool" }> =>
      block.type === "tool",
  );
  const nonToolBlocks = blocks.filter((block) => block.type !== "tool");

  return (
    <>
      {toolBlocks.length > 0 && (
        <ToolStepBlock blocks={toolBlocks} projectDir={projectDir} />
      )}
      {nonToolBlocks.map((block) => {
        switch (block.type) {
          case "summary":
            return <SummaryBlock key={block.id} block={block} />;
          case "markdown":
            return <MarkdownBlock key={block.id} block={block} />;
          case "explanation":
            return <ExplanationBlock key={block.id} block={block} />;
          case "finding":
            return <FindingCard key={block.id} block={block} />;
          case "code":
            return <CodeBlockView key={block.id} block={block} />;
          case "diff":
            return <DiffBlock key={block.id} block={block} />;
          case "test":
            return <TestRunBlock key={block.id} block={block} />;
          case "error":
            return <ErrorBlock key={block.id} block={block} />;
          case "permission":
            return <PermissionBlock key={block.id} block={block} />;
          case "file-change":
            return <FileChangeBlock key={block.id} block={block} />;
          case "safety-ask":
            return <SafetyAskBlock key={block.id} block={block} />;
          default:
            return null;
        }
      })}
    </>
  );
}
