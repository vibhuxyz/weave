import type { DiffBlock as DiffBlockModel } from "../normalize/types";
import { CodePanel } from "./CodePanel";

export function DiffBlock({ block }: { block: DiffBlockModel }) {
  return (
    <CodePanel code={block.diff} file={block.file ?? "diff"} variant="diff" />
  );
}
