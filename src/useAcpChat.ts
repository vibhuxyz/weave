import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { ServerMessage } from "../server/index.ts";

export interface ToolEntry {
  id: string;
  title: string;
  status: string;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolEntry[];
}

export type ConnectionState =
  | "idle"
  | "connecting"
  | "ready"
  | "closed"
  | "error";

/**
 * Owns the WebSocket to the ACP server and folds `session/update`
 * notifications into a transcript the UI can render.
 *
 * Pass `null` for `port` while no project is chosen — the hook stays idle
 * rather than dialling a server that is not running yet.
 */
export function useAcpChat(port: number | null) {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<ConnectionState>("idle");
  const [cwd, setCwd] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Append to the current assistant turn, starting one if needed. */
  const withAssistantTurn = useCallback(
    (mutate: (turn: ChatTurn) => ChatTurn) => {
      setTurns((current) => {
        const last = current.at(-1);
        if (last?.role === "assistant") {
          return [...current.slice(0, -1), mutate(last)];
        }
        const fresh: ChatTurn = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "",
          tools: [],
        };
        return [...current, mutate(fresh)];
      });
    },
    [],
  );

  const applyUpdate = useCallback(
    (update: SessionUpdate) => {
      switch (update.sessionUpdate) {
        case "agent_message_chunk": {
          if (update.content.type !== "text") return;
          const chunk = update.content.text;
          withAssistantTurn((turn) => ({ ...turn, text: turn.text + chunk }));
          return;
        }
        case "tool_call": {
          withAssistantTurn((turn) => ({
            ...turn,
            tools: [
              ...turn.tools,
              {
                id: update.toolCallId,
                title: update.title,
                status: update.status ?? "pending",
              },
            ],
          }));
          return;
        }
        case "tool_call_update": {
          withAssistantTurn((turn) => ({
            ...turn,
            tools: turn.tools.map((tool) =>
              tool.id === update.toolCallId
                ? { ...tool, status: update.status ?? tool.status }
                : tool,
            ),
          }));
          return;
        }
        default:
          // plan / agent_thought_chunk / user_message_chunk / commands —
          // not rendered in V0.
          return;
      }
    },
    [withAssistantTurn],
  );

  useEffect(() => {
    if (port == null) {
      setState("idle");
      return;
    }

    setState("connecting");
    setTurns([]);
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as ServerMessage;
      switch (message.type) {
        case "ready":
          setState("ready");
          setCwd(message.cwd);
          return;
        case "update":
          applyUpdate(message.update);
          return;
        case "turn-end":
          setBusy(false);
          return;
        case "error":
          setError(message.message);
          setBusy(false);
          return;
      }
    };

    socket.onerror = () => setState("error");
    socket.onclose = () => setState((s) => (s === "error" ? s : "closed"));

    return () => socket.close();
  }, [applyUpdate, port]);

  const send = useCallback((text: string) => {
    const trimmed = text.trim();
    const socket = socketRef.current;
    if (!trimmed || !socket || socket.readyState !== WebSocket.OPEN) return;

    setError(null);
    setBusy(true);
    setTurns((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", text: trimmed, tools: [] },
    ]);
    socket.send(JSON.stringify({ type: "prompt", text: trimmed }));
  }, []);

  const cancel = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "cancel" }));
  }, []);

  return { state, cwd, turns, busy, error, send, cancel };
}
