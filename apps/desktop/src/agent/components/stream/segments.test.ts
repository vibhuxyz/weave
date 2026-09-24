import test from "node:test";
import assert from "node:assert/strict";
import type { ToolEntry } from "@/features/chat/hooks";
import { segmentsOf } from "./segments";

const tool = (fields: Partial<ToolEntry> & Pick<ToolEntry, "id" | "kind">): ToolEntry => ({ title: "Terminal", status: "completed", ...fields });

test("a turn saved before segments existed shows its tools, then its text", () => {
  const segments = segmentsOf({ text: "answer", tools: [tool({ id: "t1", kind: "execute" })] });
  assert.deepEqual(segments.map((segment) => segment.kind), ["tools", "text"]);
});
