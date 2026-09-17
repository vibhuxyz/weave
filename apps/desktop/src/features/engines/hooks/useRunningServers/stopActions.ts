import type { Dispatch, SetStateAction } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import type { DockerService, PortInfo, RunningServer } from "./types";

function clearStopping(
  setStopping: Dispatch<SetStateAction<Record<string, boolean>>>,
  key: string,
): void {
  setStopping((s) => {
    const next = { ...s };
    delete next[key];
    return next;
  });
}

export async function stopContainer(
  container: NonNullable<RunningServer["container"]>,
  key: string,
  setStopping: Dispatch<SetStateAction<Record<string, boolean>>>,
  setContainers: Dispatch<SetStateAction<DockerService[]>>,
): Promise<void> {
  const stack = container.composeProject
    ? ` and the rest of the "${container.composeProject}" stack`
    : "";
  const confirmed = await ask(
    `Stop container "${container.name}"${stack}?\n\n` +
      `Data in its volumes is kept — \`docker compose up\` brings it back.`,
    { title: "Stop container", kind: "warning" },
  );
  if (!confirmed) return;

  setStopping((s) => ({ ...s, [key]: true }));
  try {
    await invoke("stop_container", { id: container.id });
  } catch {
    // The next docker poll decides whether it worked.
  }
  // Clearing eagerly would flash the row back for up to one poll; leave
  // "Stopping…" up until `docker ps` stops reporting it.
  setContainers((current) => current.filter((c) => c.id !== container.id));
  clearStopping(setStopping, key);
}

export async function stopPortProcess(
  port: number,
  key: string,
  setAlive: Dispatch<SetStateAction<Record<number, boolean>>>,
  setStopping: Dispatch<SetStateAction<Record<string, boolean>>>,
): Promise<void> {
  let info: PortInfo | null = null;
  try {
    info = await invoke<PortInfo | null>("port_info", { port });
  } catch {
    /* fall through */
  }
  if (!info) {
    setAlive((a) => ({ ...a, [port]: false }));
    return;
  }
  const confirmed = await ask(
    `Kill "${info.command}"\n(pid ${info.pid}) listening on port ${port}?`,
    { title: "Stop server", kind: "warning" },
  );
  if (!confirmed) return;

  setStopping((s) => ({ ...s, [key]: true }));
  try {
    await invoke("kill_port", { port });
  } catch {
    /* the poll below decides whether it worked */
  }

  // Poll until the port goes quiet (or give up after ~8s).
  const deadline = Date.now() + 8000;
  const settle = async () => {
    let gone = false;
    try {
      gone = (await invoke<PortInfo | null>("port_info", { port })) == null;
    } catch {
      gone = true;
    }
    if (gone || Date.now() > deadline) {
      setAlive((a) => ({ ...a, [port]: false }));
      clearStopping(setStopping, key);
    } else {
      setTimeout(settle, 700);
    }
  };
  void settle();
}
