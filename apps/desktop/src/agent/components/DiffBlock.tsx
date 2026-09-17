import type { DiffBlock as DiffBlockModel } from "@/agent/normalize";
import { CodePanel } from "./CodePanel";

export function DiffBlock({ block }: { block: DiffBlockModel }) {
  return (
    <CodePanel code={block.diff} file={block.file ?? "diff"} variant="diff" />
  );
}
