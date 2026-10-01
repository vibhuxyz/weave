import { IMAGE_ONLY_RUN_REQUEST, OTHER_SLASH_COMMAND } from "./constants";
import { parseChatCommand, parseRunCommand } from "./run-command";
import type { DraftContext, DraftRoute } from "./types";

export interface RunImageInput {
  readonly data: string;
  readonly mimeType: string;
  readonly prompt?: string;
}

export interface TeamStartMessage {
  readonly type: "start-run";
  readonly request: string;
  readonly images?: readonly RunImageInput[];
}

function attachedImages(images: readonly RunImageInput[]): readonly RunImageInput[] {
  return images.map((image) => {
    const note = image.prompt?.replace(/\s+/g, " ").trim();
    return { data: image.data, mimeType: image.mimeType, ...(note ? { prompt: note } : {}) };
  });
}

export function teamStartMessage(request: string, images: readonly RunImageInput[] = []): TeamStartMessage {
  const attached = attachedImages(images);
  const text = request.trim();
  return {
    type: "start-run",
    request: text || (attached.length > 0 ? IMAGE_ONLY_RUN_REQUEST : ""),
    ...(attached.length > 0 ? { images: attached } : {}),
  };
}

function needsChat(context: DraftContext): boolean {
  return context.imageCount > 0 || context.mentionCount > 0 || context.isRunActive;
}

export function routeDraft(draft: string, context: DraftContext): DraftRoute {
  const runRequest = parseRunCommand(draft);
  if (runRequest !== null) return { kind: "team", request: runRequest };
  const chatRequest = parseChatCommand(draft);
  if (chatRequest !== null) return { kind: "chat", text: chatRequest, canHandOff: false };
  const canHandOff = !needsChat(context) && !OTHER_SLASH_COMMAND.test(draft.trim());
  return { kind: "chat", text: draft, canHandOff };
}
