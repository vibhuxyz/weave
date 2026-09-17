export type ChatAttachmentKind = "image" | "file" | "directory";

export interface ChatImageAttachmentDraft {
  id: string;
  kind: "image";
  name: string;
  path?: string;
  mimeType: string;
  base64: string;
  previewUrl: string;
  /** What the agent should fix or build from this specific image. */
  prompt: string;
}

export interface ChatFileAttachmentDraft {
  id: string;
  kind: "file";
  name: string;
  path?: string;
  mimeType?: string;
}

export interface ChatDirectoryAttachmentDraft {
  id: string;
  kind: "directory";
  name: string;
  path: string;
}

export type ChatAttachmentDraft =
  | ChatImageAttachmentDraft
  | ChatFileAttachmentDraft
  | ChatDirectoryAttachmentDraft;
