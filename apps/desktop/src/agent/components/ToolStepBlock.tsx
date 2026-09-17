import { ToolSteps } from '@/features/chat/components';
import type { ToolStepBlock as ToolStepBlockModel } from "@/agent/normalize";

export function ToolStepBlock({
  blocks,
  projectDir,
  onStop,
}: {
  blocks: ToolStepBlockModel[];
  projectDir: string | null;
  onStop?: () => void;
}) {
  return (
    <ToolSteps
      tools={blocks.map((block) => block.tool)}
      projectDir={projectDir}
      onStop={onStop}
    />
  );
}
