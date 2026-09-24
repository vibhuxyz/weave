import type { ChatTurn, ToolEntry } from "@/features/chat/hooks";
import { Prose } from "../Prose";
import { AnsweredQuestions } from "./AnsweredQuestions";
import { segmentsOf } from "./segments";
import { ToolGroup } from "./tools";

export function TurnSegments({ turn, onOpenDiff }: { readonly turn: ChatTurn; readonly onOpenDiff?: (path?: string) => void }) {
  const toolsById = new Map(turn.tools.map((tool) => [tool.id, tool]));
  return (
    <>
      {segmentsOf(turn).map((segment) => {
        if (segment.kind === "text") {
          return segment.text.trim() ? <Prose key={segment.id}>{segment.text}</Prose> : null;
        }
        if (segment.kind === "answers") return <AnsweredQuestions key={segment.id} answers={segment.answers} />;
        const tools = segment.toolIds.map((id) => toolsById.get(id)).filter((tool): tool is ToolEntry => tool !== undefined);
        return tools.length > 0 ? <ToolGroup key={segment.id} tools={tools} turn={turn} onOpenDiff={onOpenDiff} /> : null;
      })}
    </>
  );
}
