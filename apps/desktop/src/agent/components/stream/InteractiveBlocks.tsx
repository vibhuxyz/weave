import type { PlanExitIntent } from "@/shared/lib";
import type { TurnPlan } from "@/features/chat/hooks";
import type { AgentBlock, BlockAction } from "@/agent/normalize";
import { BlockErrorBoundary } from "../BlockErrorBoundary";
import { CheckpointBlock } from "../CheckpointBlock";
import { ErrorBlock } from "../ErrorBlock";
import { PermissionBlock } from "../PermissionBlock";
import { PlanBlockView } from "../PlanBlockView";
import { SafetyAskBlock } from "../SafetyAskBlock";

export interface InteractiveHandlers {
  readonly engineLabel: string;
  readonly isLatestTurn: boolean;
  readonly isChanged: boolean;
  readonly onAction?: (action: BlockAction) => void;
  readonly onSend?: (text: string) => void;
  readonly onUpdatePlan?: (turnId: string, plan: TurnPlan) => void;
  readonly onExitPlanMode?: (intent?: PlanExitIntent) => void;
  readonly onStop?: () => void;
}

function renderBlock(block: AgentBlock, handlers: InteractiveHandlers) {
  switch (block.type) {
    case "plan":
      return (
        <PlanBlockView
          block={block}
          engineLabel={handlers.engineLabel}
          onSend={handlers.onSend}
          onExitPlanMode={handlers.onExitPlanMode}
          onStop={handlers.onStop}
          onUpdatePlan={(plan) => handlers.onUpdatePlan?.(block.turnId ?? block.id, plan)}
          isLatestTurn={handlers.isLatestTurn}
        />
      );
    case "checkpoint":
      return <CheckpointBlock block={block} onAction={handlers.onAction} />;
    case "safety-ask":
      return <SafetyAskBlock block={block} onSend={handlers.onSend} changed={handlers.isChanged} />;
    case "error":
      return <ErrorBlock block={block} />;
    case "permission":
      return <PermissionBlock block={block} />;
    default:
      return null;
  }
}

export function InteractiveBlocks({ blocks, handlers }: { readonly blocks: readonly AgentBlock[]; readonly handlers: InteractiveHandlers }) {
  return (
    <>
      {blocks.map((block) => {
        const content = renderBlock(block, handlers);
        return content ? <BlockErrorBoundary key={block.id}>{content}</BlockErrorBoundary> : null;
      })}
    </>
  );
}
