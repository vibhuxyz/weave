import type { PromptBlock } from "../session/types.ts";
import { MAX_IMAGE_NOTE_CHARS } from "./constants.ts";
import type { PromptImage } from "./types.ts";

function imageLabel(index: number, prompt: string | undefined): string {
  const note = prompt?.replace(/\s+/g, " ").trim().slice(0, MAX_IMAGE_NOTE_CHARS) ?? "";
  return note === "" ? `Image ${index + 1}:` : `Image ${index + 1}: ${note}`;
}

export function promptBlocks(text: string, images?: readonly PromptImage[]): readonly PromptBlock[] {
  const blocks: PromptBlock[] = [{ type: "text", text }];
  for (const [index, image] of (images ?? []).entries()) {
    blocks.push({ type: "text", text: imageLabel(index, image.prompt) });
    blocks.push({ type: "image", data: image.data, mimeType: image.mimeType });
  }
  return blocks;
}

export function blocksForSessionPrompt(
  prompt: string,
  images: readonly PromptImage[] | undefined,
  imagesAlreadySent: boolean,
): { readonly blocks: readonly PromptBlock[]; readonly imagesSent: boolean } {
  if (imagesAlreadySent || images === undefined || images.length === 0) {
    return { blocks: [{ type: "text", text: prompt }], imagesSent: imagesAlreadySent };
  }
  return { blocks: promptBlocks(prompt, images), imagesSent: true };
}
