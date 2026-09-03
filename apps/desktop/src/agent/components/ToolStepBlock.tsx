import { ToolSteps } from "../../ToolSteps";
import type { ToolStepBlock as ToolStepBlockModel } from "../normalize/types";

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
