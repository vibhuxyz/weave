import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SessionConfigOption,
  SessionUpdate,
  ToolCallStatus,
  ToolKind,
} from "@agentclientprotocol/sdk";
import type {
  ConversationMeta,
  GitStatus,
  ServerMessage,
} from "../server/index.ts";

export type { ConversationMeta };

export interface ToolEntry {
  id: string;
  title: string;
  status: ToolCallStatus;
  /** read | edit | delete | move | search | execute | think | fetch | … */
  kind: ToolKind;
  /** Terminal / tool output text, accumulated from `content` on each update. */
  output?: string;
  /** Epoch ms when the call first appeared, and when it finished. For timers. */
  startedAt?: number;
  endedAt?: number;
  sourceEventIds?: string[];
  sourceSeq?: number;
}

const TERMINAL_STATUS = new Set<ToolCallStatus>(["completed", "failed"]);

/** Pull plain-text output out of an ACP tool call's `content` array. */
function toolText(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts: string[] = [];
  for (const item of content) {
    if (item?.type === "content" && item.content?.type === "text") {
      parts.push(item.content.text);
    }
  }
  return parts.length > 0 ? parts.join("") : undefined;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Names of agents @-mentioned on this prompt, for the pills on the bubble. */
  mentions?: string[];
  /** The agent's reasoning stream (`agent_thought_chunk`), shown collapsed. */
  thought: string;
  tools: ToolEntry[];
  sourceEventIds?: string[];
  sourceSeq?: number;
}

/**
 * Strip the `<system>…</system>` preamble the composer prepends for @-mentioned
 * and standing agents, so a replayed user turn reads as what the person typed.
 */
function stripSystemPreamble(text: string): string {
  const end = text.indexOf("\n</system>\n\n");
  return text.startsWith("<system>\n") && end !== -1
    ? text.slice(end + "\n</system>\n\n".length)
    : text;
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
  const [engineId, setEngineId] = useState<string | null>(null);
  const [engineLabel, setEngineLabel] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The agent's own settings — `model`, `mode`, whatever else it advertises. */
  const [configOptions, setConfigOptions] = useState<SessionConfigOption[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [git, setGit] = useState<GitStatus>({ branch: null, changes: [] });
  const [resumed, setResumed] = useState(false);
  const [chats, setChats] = useState<ConversationMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [engines, setEngines] = useState<
    { id: string; label: string; installed: boolean }[]
  >([]);
  /** Pre-change config values, kept only until the agent confirms or refuses. */
  const previousConfigRef = useRef<Record<string, string>>({});
  /** `@file` mention results, and the query they answer (drops stale replies). */
  const [fileMatches, setFileMatches] = useState<string[]>([]);
  const fileQueryRef = useRef<string>("");

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
          thought: "",
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
      const merged =
        last?.role === "user" ? last.text + text : text;
      const turn = { text: stripSystemPreamble(merged) };
      if (last?.role === "user") {
        return [...current.slice(0, -1), { ...last, ...turn }];
      }
      return [
        ...current,
        { id: crypto.randomUUID(), role: "user", thought: "", tools: [], ...turn },
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
        case "agent_thought_chunk": {
          if (update.content.type !== "text") return;
          const chunk = update.content.text;
          withAssistantTurn((turn) => ({
            ...turn,
            thought: turn.thought + chunk,
            sourceEventIds: sourceEventIds
              ? [...(turn.sourceEventIds ?? []), ...sourceEventIds]
              : turn.sourceEventIds,
            sourceSeq: source?.seq ?? turn.sourceSeq,
          }));
          return;
        }
        case "tool_call": {
          const startStatus = update.status ?? "pending";
          const now = replay ? undefined : Date.now();
          withAssistantTurn((turn) => ({
            ...turn,
            tools: [
              ...turn.tools,
              {
                id: update.toolCallId,
                title: update.title,
                status: startStatus,
                kind: update.kind ?? "other",
                output: toolText(update.content),
                startedAt: now,
                endedAt: TERMINAL_STATUS.has(startStatus) ? now : undefined,
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
            tools: turn.tools.map((tool) => {
              if (tool.id !== update.toolCallId) return tool;
              const nextStatus = update.status ?? tool.status;
              const nowEnded =
                TERMINAL_STATUS.has(nextStatus) && !TERMINAL_STATUS.has(tool.status);
              return {
                ...tool,
                status: nextStatus,
                title: update.title ?? tool.title,
                kind: update.kind ?? tool.kind,
                // Updates carry the full content each time; keep the last
                // non-empty snapshot so a status-only update never wipes it.
                output: toolText(update.content) ?? tool.output,
                startedAt: tool.startedAt ?? (replay ? undefined : Date.now()),
                endedAt: nowEnded ? Date.now() : tool.endedAt,
                sourceEventIds: sourceEventIds ?? tool.sourceEventIds,
                sourceSeq: source?.seq ?? tool.sourceSeq,
              };
            }),
          }));
          return;
        }
        default:
          // plan / user_message_chunk / commands — not rendered yet.
          return;
      }
    },
    [withAssistantTurn, appendUserChunk],
  );

  useEffect(() => {
    // Clear state from previous connections when port changes
    setTurns([]);
    setConfigOptions([]);
    setConfigValues({});
    setEngineId(null);
    setEngineLabel(null);
    setError(null);
    setResumed(false);
    setChats([]);
    setActiveSessionId(null);

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
            setEngineId(message.engineId);
            setEngineLabel(message.engineLabel);
            setResumed(message.resumed);
            setActiveSessionId(message.sessionId);
            // A fresh chat starts empty; a resumed one is wiped by the
            // preceding `reset` and rebuilt by the replay that follows.
            if (!message.resumed) setTurns([]);
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
          case "chats":
            setChats(message.chats);
            if (message.activeSessionId)
              setActiveSessionId(message.activeSessionId);
            return;
          case "engines":
            setEngines(message.engines);
            return;
          case "files":
            if (message.query === fileQueryRef.current) {
              setFileMatches(message.files);
            }
            return;
          case "reset":
            setTurns([]);
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

  const send = useCallback(
    (text: string, opts?: { persona?: string; mentions?: string[] }) => {
      const trimmed = text.trim();
      const socket = socketRef.current;
      if (!trimmed || !socket || socket.readyState !== WebSocket.OPEN) return;

      setError(null);
      setBusy(true);
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          text: trimmed,
          mentions: opts?.mentions?.length ? opts.mentions : undefined,
          thought: "",
          tools: [],
        },
      ]);
      socket.send(
        JSON.stringify({
          type: "prompt",
          text: trimmed,
          persona: opts?.persona,
        }),
      );
    },
    [],
  );

  const cancel = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "cancel" }));
  }, []);

  /** Ask the server for project paths matching `query` (for `@file`). */
  const requestFiles = useCallback((query: string) => {
    fileQueryRef.current = query;
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "list-files", query }));
  }, []);

  const clearFileMatches = useCallback(() => {
    fileQueryRef.current = "";
    setFileMatches([]);
  }, []);

  /**
   * Rebind this conversation to a different engine binary. The server starts a
   * fresh session on the new engine and carries the transcript forward — the
   * chat continues, the engine changes. No Rust restart.
   */
  const switchEngine = useCallback((nextEngineId: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    setBusy(false);
    setError(null);
    socket.send(JSON.stringify({ type: "switch-engine", engineId: nextEngineId }));
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

  const newChat = useCallback((instructions?: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    setBusy(false);
    socket.send(
      JSON.stringify({
        type: "new-chat",
        instructions: instructions?.trim() || undefined,
      }),
    );
  }, []);

  const openChat = useCallback(
    (sessionId: string) => {
      const socket = socketRef.current;
      if (socket?.readyState !== WebSocket.OPEN) return;
      setBusy(false);
      setError(null);
      socket.send(JSON.stringify({ type: "open-chat", sessionId }));
    },
    [],
  );

  const refreshGit = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "git" }));
    }
  }, []);

  return {
    state,
    cwd,
    engineId,
    engineLabel,
    turns,
    busy,
    error,
    configOptions,
    configValues,
    git,
    resumed,
    engines,
    chats,
    activeSessionId,
    send,
    switchEngine,
    fileMatches,
    requestFiles,
    clearFileMatches,
    cancel,
    setConfig,
    refreshGit,
    newChat,
    openChat,
  };
}
