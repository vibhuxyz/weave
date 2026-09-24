import { useMemo } from "react";
import type { PlanExitIntent } from "@/shared/lib";
import type { GitStatus } from "../../../../server/index.ts";
import type { ChatTurn, TurnPlan } from "@/features/chat/hooks";
import { type BlockAction, messageToBlocks } from "@/agent/normalize";
import { turnDiff } from "@/agent/diff";
import { BlockErrorBoundary } from "../BlockErrorBoundary";
import { TurnDiffBar } from "../TurnDiffBar";
import { InteractiveBlocks } from "./InteractiveBlocks";
import { StreamStatusLine } from "./StreamStatusLine";
import { ThoughtRow } from "./ThoughtRow";
import { TurnSegments } from "./TurnSegments";

export interface StreamedTurnProps {
  readonly turn: ChatTurn;
  readonly projectDir: string | null;
  readonly git: GitStatus;
  readonly configValues: Record<string, string>;
  readonly engineId: string;
  readonly engineLabel: string;
  readonly isRunning: boolean;
  readonly isLatestTurn: boolean;
  readonly otherEngines?: { id: string; label: string }[];
  readonly diffOpen?: boolean;
  readonly onAction?: (action: BlockAction) => void;
  readonly onSend?: (text: string) => void;
  readonly onUpdatePlan?: (turnId: string, plan: TurnPlan) => void;
  readonly onExitPlanMode?: (intent?: PlanExitIntent) => void;
  readonly onOpenDiff?: (path?: string) => void;
}

export function StreamedTurn(props: StreamedTurnProps) {
  const { turn, git, configValues, engineId, engineLabel, isRunning, otherEngines } = props;
  const viewModel = useMemo(
    () =>
      messageToBlocks({
        id: turn.id,
        text: turn.text,
        tools: turn.tools,
        git,
        status: isRunning ? "running" : "completed",
        configValues,
        engineId,
        engineLabel,
        personas: turn.personas,
        plan: turn.plan,
        usage: turn.usage,
        sourceEventIds: turn.sourceEventIds,
        sourceSeq: turn.sourceSeq,
        checkpoint: turn.checkpoint,
        otherEngines,
      }),
    [turn, git, configValues, engineId, engineLabel, isRunning, otherEngines],
  );
  const diff = useMemo(() => turnDiff(turn), [turn]);
  const showsStatus = isRunning && props.isLatestTurn;
  const handlers = {
    engineLabel,
    isLatestTurn: props.isLatestTurn,
    isChanged: viewModel.meta.changed ?? false,
    onAction: props.onAction,
    onSend: props.onSend,
    onUpdatePlan: props.onUpdatePlan,
    onExitPlanMode: props.onExitPlanMode,
    onStop: props.onAction ? () => props.onAction?.({ type: "cancel_run" }) : undefined,
  };
  return (
    <div className="flex w-full flex-col gap-4 text-agent-text">
      {turn.thought && <ThoughtRow text={turn.thought} />}
      <TurnSegments turn={turn} onOpenDiff={props.onOpenDiff} />
      <InteractiveBlocks blocks={viewModel.blocks} handlers={handlers} />
      {!showsStatus && diff.files.length > 0 && (
        <BlockErrorBoundary>
          <TurnDiffBar diff={diff} onOpenDiff={props.onOpenDiff} active={props.diffOpen} projectDir={props.projectDir} />
        </BlockErrorBoundary>
      )}
      {showsStatus && <StreamStatusLine turn={turn} />}
    </div>
  );
}
