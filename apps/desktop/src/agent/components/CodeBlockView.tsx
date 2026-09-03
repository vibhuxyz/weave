import type { CodeBlock as CodeBlockModel } from "../normalize/types";
import { CodePanel } from "./CodePanel";

export function CodeBlockView({ block }: { block: CodeBlockModel }) {
  return (
    <CodePanel
      code={block.code}
      title={block.title}
      file={block.file}
      language={block.language}
    />
  );
}
