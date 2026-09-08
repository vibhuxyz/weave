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
import {
  isAuthRequiredError,
  type EngineAuthMethod,
  type EngineAuthOperation,
} from "@weave/protocol";
import type { ChatImageAttachmentDraft } from "@/shared/types/messages";

export type { ConversationMeta };

export interface ToolEntry {
  id: string;
  title: string;
  status: ToolCallStatus;
  /** read | edit | delete | move | search | execute | think | fetch | … */
  kind: ToolKind;
  /** Terminal / tool output text, accumulated from `content` on each update. */
  output?: string;
  /** The tool's raw arguments (e.g. `{ command }`, `{ plan }`, `{ content }`). */
  rawInput?: unknown;
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

/** An image attached to a prompt, with the per-image fix/build instructions. */
export interface ChatImageAttachment {
  previewUrl: string;
  mimeType: string;
  prompt: string;
}

export interface PlanItem {
  id: string;
  content: string;
  priority?: "high" | "medium" | "low";
  status?: "pending" | "in_progress" | "completed";
}

export interface TurnPlan {
  entries: PlanItem[];
  approved?: boolean;
}

/**
 * Token accounting for one assistant turn. `contextUsed`/`contextSize` come from
 * the running ACP `usage_update` (context window); `inputTokens`/`outputTokens`/
 * `thoughtTokens` land once from the `PromptResponse` on `turn-end`. Every field
 * is optional — not every engine reports any of this.
 */
export interface TurnUsage {
  contextUsed?: number;
  contextSize?: number;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  thoughtTokens?: number;
}

export interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Names of agents @-mentioned on this prompt, for the pills on the bubble. */
  mentions?: string[];
  images?: ChatImageAttachment[];
  /** The agent's reasoning stream (`agent_thought_chunk`), shown collapsed. */
  thought: string;
  tools: ToolEntry[];
  plan?: TurnPlan;
  /** Token usage for this turn, as far as the engine has reported it. */
  usage?: TurnUsage;
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
  /**
   * An engine that refused to open a session until the user signs in, plus the
   * sign-in itself once started. Both are backend-owned snapshots — the UI
   * never derives them, it only renders what the last message said.
   */
  const [authRequired, setAuthRequired] = useState<{
    engineId: string;
    engineLabel: string;
    message: string;
    methods: EngineAuthMethod[];
  } | null>(null);
  const [authOperation, setAuthOperation] =
    useState<EngineAuthOperation | null>(null);
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
  const [isSwitchingEngine, setIsSwitchingEngine] = useState(false);
  const [targetEngineId, setTargetEngineId] = useState<string | null>(null);
  const [isSettingConfig, setIsSettingConfig] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState<string | null>(null);
  const [pendingConfigValue, setPendingConfigValue] = useState<string | null>(null);
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
          if (import.meta.env.DEV && /plan/i.test(update.title ?? "")) {
            // Temporary: capture the exact shape of the plan-mode tool call so
            // the approval modal can pull the plan text from the right field.
            console.log("[plan-tool]", JSON.stringify(update, null, 2));
          }
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
                rawInput: update.rawInput,
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
                rawInput: update.rawInput ?? tool.rawInput,
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
        case "plan": {
          withAssistantTurn((turn) => {
            const nextEntries: PlanItem[] = (update.entries ?? []).map((entry, idx) => ({
              id: `plan-step-${idx + 1}`,
              content: entry.content,
              priority: entry.priority,
              status: entry.status,
            }));
            return {
              ...turn,
              plan: {
                entries: nextEntries,
                approved: turn.plan?.approved ?? false,
              },
            };
          });
          return;
        }
        case "usage_update": {
          // Running context-window figure + cumulative session cost. Claude Code
          // and Codex emit this per turn; other engines never do.
          withAssistantTurn((turn) => ({
            ...turn,
            usage: {
              ...turn.usage,
              contextUsed: update.used,
              contextSize: update.size,
              costUsd: update.cost?.amount ?? turn.usage?.costUsd,
            },
          }));
          return;
        }
        default:
          // user_message_chunk / commands — not rendered yet.
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
            setIsSwitchingEngine(false);
            setTargetEngineId(null);
            setIsSettingConfig(false);
            setPendingConfigId(null);
            setPendingConfigValue(null);
            setAuthRequired(null);
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
            setIsSettingConfig(false);
            setPendingConfigId(null);
            setPendingConfigValue(null);
            delete previousConfigRef.current[message.configId];
            setConfigValues((current) => ({
              ...current,
              [message.configId]: message.value,
            }));
            return;
          case "config-rejected": {
            setIsSettingConfig(false);
            setPendingConfigId(null);
            setPendingConfigValue(null);
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
          case "turn-end": {
            const usage = message.usage;
            if (usage) {
              withAssistantTurn((turn) => ({
                ...turn,
                usage: {
                  ...turn.usage,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  thoughtTokens: usage.thoughtTokens ?? undefined,
                },
              }));
            }
            setBusy(false);
            return;
          }
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
          case "auth-required":
            setIsSwitchingEngine(false);
            setTargetEngineId(null);
            // Deliberately NOT `setError`: this is a state with an action, and
            // routing it through the error toast is what left the user staring
            // at "Authentication required…" with nothing to click.
            setAuthRequired({
              engineId: message.engineId,
              engineLabel: message.engineLabel,
              message: message.message,
              methods: message.methods,
            });
            setBusy(false);
            return;
          case "auth-state":
            setAuthOperation(message.operation);
            // A sign-in that took clears the prompt that caused it; `ready`
            // arrives separately and rebinds the conversation.
            if (message.operation.status === "succeeded") setAuthRequired(null);
            return;
          case "error":
            setIsSwitchingEngine(false);
            setTargetEngineId(null);
            setIsSettingConfig(false);
            setPendingConfigId(null);
            setPendingConfigValue(null);
            if (isAuthRequiredError(message.message)) {
              const activeId = targetEngineId ?? engineId ?? "antigravity";
              const isClaude = activeId === "claude-code";
              const isCodex = activeId === "codex";
              setAuthRequired({
                engineId: activeId,
                engineLabel:
                  engineLabel ??
                  (isClaude
                    ? "Claude Code"
                    : isCodex
                    ? "Codex"
                    : "Google Antigravity"),
                message: message.message,
                methods: isClaude
                  ? [
                      {
                        id: "claude-ai-login",
                        name: "Claude Subscription",
                        description: "Use Claude subscription",
                        kind: "terminal",
                      },
                      {
                        id: "console-login",
                        name: "Anthropic Console",
                        description: "Use Anthropic Console (API usage billing)",
                        kind: "terminal",
                      },
                    ]
                  : isCodex
                  ? [
                      {
                        id: "chat-gpt-device-code",
                        name: "Sign in with Device Code",
                        description: "Sign in using one-time verification code (recommended)",
                        kind: "terminal",
                      },
                      {
                        id: "chat-gpt",
                        name: "Sign in with Browser",
                        description: "Sign in using your OpenAI ChatGPT account in browser",
                        kind: "terminal",
                      },
                      {
                        id: "api-key",
                        name: "OpenAI API Key",
                        description: "Authenticate using an OpenAI API Key",
                        kind: "terminal",
                      },
                    ]
                  : [
                      {
                        id: "agy-login",
                        name: "Sign in with Google Antigravity",
                        description: "Runs `agy auth login` to authenticate",
                        kind: "terminal",
                      },
                    ],
              });
              setBusy(false);
              return;
            }
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
  }, [applyUpdate, withAssistantTurn, port]);

  const send = useCallback(
    (
      text: string,
      opts?: {
        persona?: string;
        mentions?: string[];
        images?: ChatImageAttachmentDraft[];
      },
    ) => {
      const trimmed = text.trim();
      const images = opts?.images?.length ? opts.images : undefined;
      const socket = socketRef.current;
      if ((!trimmed && !images) || !socket || socket.readyState !== WebSocket.OPEN) return;

      setError(null);
      setBusy(true);
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          text: trimmed,
          mentions: opts?.mentions?.length ? opts.mentions : undefined,
          images: images?.map((image) => ({
            previewUrl: image.previewUrl,
            mimeType: image.mimeType,
            prompt: image.prompt,
          })),
          thought: "",
          tools: [],
        },
      ]);
      socket.send(
        JSON.stringify({
          type: "prompt",
          text: trimmed,
          persona: opts?.persona,
          images: images?.map((image) => ({
            data: image.base64,
            mimeType: image.mimeType,
            prompt: image.prompt,
          })),
        }),
      );
    },
    [],
  );

  const cancel = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "cancel" }));
  }, []);

  /** Start a sign-in. Progress arrives as `auth-state` snapshots. */
  const startAuth = useCallback((engineId: string, methodId: string, secret?: string) => {
    const normalized = engineId === "agy" ? "antigravity" : engineId;
    socketRef.current?.send(
      JSON.stringify({ type: "start-auth", engineId: normalized, methodId, secret }),
    );
  }, []);

  const cancelAuth = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "cancel-auth" }));
  }, []);

  /** Drop a finished sign-in the UI has shown. */
  const clearAuth = useCallback(() => {
    setAuthOperation(null);
    setAuthRequired(null);
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
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    setIsSwitchingEngine(true);
    setTargetEngineId(nextEngineId);
    setBusy(false);
    setError(null);
    setAuthRequired(null);
    setAuthOperation(null);
    socket.send(JSON.stringify({ type: "switch-engine", engineId: nextEngineId }));
  }, []);

  const setConfig = useCallback((configId: string, value: string) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    setIsSettingConfig(true);
    setPendingConfigId(configId);
    setPendingConfigValue(value);

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

  const refreshEngines = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "refresh-engines" }));
    }
  }, []);

  const updateTurnPlan = useCallback((turnId: string, plan: TurnPlan) => {
    setTurns((prev) =>
      prev.map((t) => (t.id === turnId ? { ...t, plan } : t)),
    );
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
    isSwitchingEngine,
    targetEngineId,
    authRequired,
    authOperation,
    startAuth,
    cancelAuth,
    clearAuth,
    fileMatches,
    requestFiles,
    clearFileMatches,
    cancel,
    setConfig,
    isSettingConfig,
    pendingConfigId,
    pendingConfigValue,
    refreshGit,
    refreshEngines,
    newChat,
    openChat,
    updateTurnPlan,
  };
}
