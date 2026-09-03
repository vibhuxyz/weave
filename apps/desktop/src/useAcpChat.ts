import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SessionConfigOption,
  SessionUpdate,
  ToolCallStatus,
  ToolKind,
} from "@agentclientprotocol/sdk";
import type { GitStatus, ServerMessage } from "../server/index.ts";

export interface ToolEntry {
  id: string;
  title: string;
  status: ToolCallStatus;
  /** read | edit | delete | move | search | execute | think | fetch | … */
  kind: ToolKind;
  sourceEventIds?: string[];
  sourceSeq?: number;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  tools: ToolEntry[];
  sourceEventIds?: string[];
  sourceSeq?: number;
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
  /** The agent's own settings — `model`, `mode`, whatever else it advertises. */
  const [configOptions, setConfigOptions] = useState<SessionConfigOption[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [git, setGit] = useState<GitStatus>({ branch: null, changes: [] });
  const [resumed, setResumed] = useState(false);
  /** Pre-change config values, kept only until the agent confirms or refuses. */
  const previousConfigRef = useRef<Record<string, string>>({});

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

  /** Append a user turn (used when replaying a resumed conversation). */
  const appendUserChunk = useCallback((text: string) => {
    setTurns((current) => {
      const last = current.at(-1);
      if (last?.role === "user") {
        return [...current.slice(0, -1), { ...last, text: last.text + text }];
      }
      return [
        ...current,
        { id: crypto.randomUUID(), role: "user", text, tools: [] },
      ];
    });
  }, []);

  const applyUpdate = useCallback(
    (
      update: SessionUpdate,
      replay = false,
      source?: { runId: string; seq: number },
    ) => {
      const sourceEventIds = source ? [`${source.runId}:${source.seq}`] : undefined;

      // Only replays carry user_message_chunk; live prompts are echoed
      // optimistically in send(), so honouring both would duplicate the turn.
      if (update.sessionUpdate === "user_message_chunk") {
        if (replay && update.content.type === "text") {
          appendUserChunk(update.content.text);
        }
        return;
      }

      switch (update.sessionUpdate) {
        case "agent_message_chunk": {
          if (update.content.type !== "text") return;
          const chunk = update.content.text;
          withAssistantTurn((turn) => ({
            ...turn,
            text: turn.text + chunk,
            sourceEventIds: sourceEventIds
              ? [...(turn.sourceEventIds ?? []), ...sourceEventIds]
              : turn.sourceEventIds,
            sourceSeq: source?.seq ?? turn.sourceSeq,
          }));
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
                kind: update.kind ?? "other",
                sourceEventIds,
                sourceSeq: source?.seq,
              },
            ],
          }));
          return;
        }
        case "tool_call_update": {
          // The agent opens a tool call with a generic placeholder title
          // ("Terminal", "Read File") and refines it once it knows the actual
          // command or path ("ls src", "Read src/paths.ts"). Keeping only
          // `status` here is why every shell step rendered as "Terminal".
          // Every field is optional per update, so fall back to what we have.
          withAssistantTurn((turn) => ({
            ...turn,
            tools: turn.tools.map((tool) =>
              tool.id === update.toolCallId
                ? {
                    ...tool,
                    status: update.status ?? tool.status,
                    title: update.title ?? tool.title,
                    kind: update.kind ?? tool.kind,
                    sourceEventIds: sourceEventIds ?? tool.sourceEventIds,
                    sourceSeq: source?.seq ?? tool.sourceSeq,
                  }
                : tool,
            ),
          }));
          return;
        }
        default:
          // plan / agent_thought_chunk / user_message_chunk / commands —
          // not rendered yet.
          return;
      }
    },
    [withAssistantTurn, appendUserChunk],
  );

  useEffect(() => {
    if (port == null) {
      setState("idle");
      return;
    }

    // The Rust side returns as soon as the node process is SPAWNED, which is
    // well before it has bound the port — so the first dial is usually
    // refused. Retry until it answers rather than failing the app on a race.
    // The same retry covers a server restart when the project changes.
    let disposed = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    setState("connecting");
    setTurns([]);

    const connect = () => {
      if (disposed) return;
      attempt += 1;
      const next = new WebSocket(`ws://127.0.0.1:${port}`);
      socket = next;
      socketRef.current = next;

      next.onopen = () => {
        attempt = 0;
      };

      next.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        switch (message.type) {
          case "ready":
            setState("ready");
            setCwd(message.cwd);
            setResumed(message.resumed);
            // A resumed session replays its own history, so clear first and
            // let the replay rebuild the transcript.
            setTurns([]);
            setConfigOptions(message.configOptions);
            setConfigValues(
              Object.fromEntries(
                message.configOptions.flatMap((option) =>
                  option.type === "select"
                    ? [[option.id, option.currentValue]]
                    : [],
                ),
              ),
            );
            return;
          case "git-status":
            setGit(message.git);
            return;
          case "config-changed":
            delete previousConfigRef.current[message.configId];
            setConfigValues((current) => ({
              ...current,
              [message.configId]: message.value,
            }));
            return;
          case "config-rejected": {
            // Roll the optimistic value back so the pill never shows a setting
            // the agent refused.
            const previous = previousConfigRef.current[message.configId];
            delete previousConfigRef.current[message.configId];
            if (previous !== undefined) {
              setConfigValues((current) => ({
                ...current,
                [message.configId]: previous,
              }));
            }
            setError(message.message);
            return;
          }
          case "update":
            applyUpdate(message.update, message.replay === true, message.source);
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

      // A refused connection fires error then close; only close is guaranteed,
      // so schedule the retry there and let error stay silent.
      next.onclose = () => {
        if (disposed || socket !== next) return;
        setBusy(false);
        if (attempt <= 40) {
          setState("connecting");
          retry = setTimeout(connect, Math.min(250 * attempt, 1000));
        } else {
          setState("closed");
        }
      };
    };

    connect();

    return () => {
      disposed = true;
      clearTimeout(retry);
      socket?.close();
    };
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

  const setConfig = useCallback((configId: string, value: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    // Optimistic, but reversible: remember what it was so `config-rejected`
    // can put it back. Without this the pill shows a value the agent refused.
    setConfigValues((current) => {
      previousConfigRef.current[configId] = current[configId] ?? "";
      return { ...current, [configId]: value };
    });
    setError(null);
    socket.send(JSON.stringify({ type: "set-config", configId, value }));
  }, []);

  const newChat = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "new-chat" }));
  }, []);

  const refreshGit = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "git" }));
    }
  }, []);

  return {
    state,
    cwd,
    turns,
    busy,
    error,
    configOptions,
    configValues,
    git,
    resumed,
    send,
    cancel,
    setConfig,
    refreshGit,
    newChat,
  };
}
