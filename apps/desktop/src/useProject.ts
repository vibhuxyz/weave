import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export type ProjectState =
  | { status: "loading" }
  | { status: "none" }
  | { status: "starting"; dir: string; engineId?: string }
  | { status: "running"; dir: string; port: number; engineId?: string }
  | { status: "error"; message: string };

/**
 * Owns "which folder is the agent working in".
 *
 * The Rust side spawns the Node ACP server rooted at that folder, so changing
 * the project means restarting the server — there is no way to re-point a live
 * ACP session at a different cwd.
 */
export function useProject() {
  const [state, setState] = useState<ProjectState>({ status: "loading" });

  const startWith = useCallback(async (dir: string, engineId?: string) => {
    setState({ status: "starting", dir, engineId });
    try {
      const port = await invoke<number>("start_agent_server", {
        projectDir: dir,
        engineId,
      });
      setState({ status: "running", dir, port, engineId });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  const choose = useCallback(async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choose a project folder",
    });
    if (typeof picked === "string") await startWith(picked);
  }, [startWith]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = await invoke<{ dir: string; engine_id: string | null } | null>("get_saved_project");
        if (cancelled) return;
        if (saved) await startWith(saved.dir, saved.engine_id ?? undefined);
        else setState({ status: "none" });
      } catch {
        if (!cancelled) setState({ status: "none" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startWith]);

  return { state, choose, startWith };
}
