import type { PromptBlock } from "@weave/agent";
import type { PromptImageData } from "../shared/index.ts";

export interface ComposeSystemOptions {
  readonly pendingPreamble: string | null;
  readonly persona?: string;
  readonly pluginBlock?: string;
  readonly ruleCatalog?: string;
  readonly builtinSkillCatalog?: string;
  readonly skillCatalog?: string;
}

export function composeSystemPrompt(
  userText: string,
  options: ComposeSystemOptions,
): string {
  const blocks = [
    options.pendingPreamble,
    options.persona?.trim() || null,
    options.pluginBlock?.trim() || null,
    options.ruleCatalog,
    options.builtinSkillCatalog,
    options.skillCatalog,
  ].filter((b): b is string => !!b);

  if (blocks.length === 0) return userText;
  return `<system>\n${blocks.join("\n\n")}\n</system>\n\n${userText}`;
}

export function buildPromptBlocks(
  text: string,
  images?: readonly PromptImageData[],
): readonly PromptBlock[] {
  const blocks: PromptBlock[] = [{ type: "text", text }];

  (images ?? []).forEach((image, i) => {
    const note = image.prompt?.trim();
    const label = note ? `Image ${i + 1}: ${note}` : `Image ${i + 1}:`;
    blocks.push({ type: "text", text: label });
    blocks.push({ type: "image", data: image.data, mimeType: image.mimeType });
  });

  return blocks;
}
