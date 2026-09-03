import { ToolSteps } from "../../ToolSteps";
import type { ToolStepBlock as ToolStepBlockModel } from "../normalize/types";

export function ToolStepBlock({
  blocks,
  projectDir,
}: {
  blocks: ToolStepBlockModel[];
  projectDir: string | null;
}) {
  return <ToolSteps tools={blocks.map((block) => block.tool)} projectDir={projectDir} />;
}

