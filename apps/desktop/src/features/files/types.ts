import type { ServerMessage } from "../../../server/index.ts";

export type FileMessage = Extract<ServerMessage, { readonly type: "file-content" | "file-error" }>;

export type FileViewState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly content: string; readonly truncated: boolean }
  | { readonly status: "error"; readonly message: string };
