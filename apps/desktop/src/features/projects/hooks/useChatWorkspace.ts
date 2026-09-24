import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type ChatWorkspaceState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly dir: string }
  | { readonly status: "error"; readonly message: string };

export function useChatWorkspace(): ChatWorkspaceState {
  const [state, setState] = useState<ChatWorkspaceState>({ status: "loading" });

  useEffect(() => {
    let isCancelled = false;
    invoke<string>("chat_workspace_dir").then(
      (dir) => {
        if (!isCancelled) setState({ status: "ready", dir });
      },
      (error: unknown) => {
        if (!isCancelled) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      },
    );
    return () => {
      isCancelled = true;
    };
  }, []);

  return state;
}
