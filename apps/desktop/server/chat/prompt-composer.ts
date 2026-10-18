import { promptBlocks, type PromptBlock } from "@weave/agent";
import { ASK_USER_SECTION, RESPONSE_FORMAT_SECTION } from "@weave/core";
import type { PromptImageData } from "../shared/index.ts";

export interface ComposeSystemOptions {
  readonly pendingPreamble: string | null;
  readonly persona?: string;
  readonly pluginBlock?: string;
  readonly ruleCatalog?: string;
  readonly decisionsBlock?: string | null;
  readonly pinnedSkills?: string;
  readonly builtinSkillCatalog?: string;
  readonly skillCatalog?: string;
  readonly teamHandoff?: string;
}

export function composeSystemPrompt(
  userText: string,
  options: ComposeSystemOptions,
): string {
  const blocks = [
    options.pendingPreamble,
    options.persona?.trim() || null,
    options.pinnedSkills,
    options.pluginBlock?.trim() || null,
    options.ruleCatalog,
    options.decisionsBlock,
    ASK_USER_SECTION,
    RESPONSE_FORMAT_SECTION,
    options.builtinSkillCatalog,
    options.skillCatalog,
    options.teamHandoff,
  ].filter((b): b is string => !!b);

  return `<system>\n${blocks.join("\n\n")}\n</system>\n\n${userText}`;
}

export function buildPromptBlocks(
  text: string,
  images?: readonly PromptImageData[],
): readonly PromptBlock[] {
  return promptBlocks(text, images);
}
