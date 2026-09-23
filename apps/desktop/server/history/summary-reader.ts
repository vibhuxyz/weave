import { readClaudeCompactSummary } from "./claude-summary-reader.ts";
import { CLAUDE_ENGINE_ID } from "./constants.ts";

export type SummaryReader = (sessionId: string) => Promise<string | null>;

export function summaryReaderFor(engineId: string, projectDir: string): SummaryReader | undefined {
  if (engineId !== CLAUDE_ENGINE_ID) return undefined;
  return (sessionId) => readClaudeCompactSummary(projectDir, sessionId);
}
