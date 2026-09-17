import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SessionConfigOption,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { GitStatus, ServerMessage } from "../../../../server/index.ts";
import type { NormalizedPlugin, ActivePluginRef } from "@weave/core/browser";
import {
  isAuthRequiredError,
  type EngineAuthMethod,
  type EngineAuthOperation,
} from "@weave/protocol";
import type { ChatImageAttachmentDraft } from "@/shared/types/messages";
import {
  authMethodsForEngine,
  engineLabelFallback,
} from "./acpChat/authErrorRecovery";
import {
  rawInputDiffs,
  splitAttachments,
  stripSystemPreamble,
  TERMINAL_STATUS,
  toolDiffs,
  toolText,
} from "./acpChat/messageParsing";
import type {
  ChatTurn,
  ConnectionState,
  ConversationMeta,
  PlanItem,
  TurnPersona,
  TurnPlan,
} from "./acpChat/types";

export type {
  ChatImageAttachment,
  ChatTurn,
  ConnectionState,
  ConversationMeta,
  PlanItem,
  ToolDiff,
  ToolEntry,
  TurnCheckpoint,
  TurnPersona,
  TurnPlan,
  TurnUsage,
} from "./acpChat/types";
export { splitAttachments } from "./acpChat/messageParsing";

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
const [configOptions, setConfigOptions] = useState<readonly SessionConfigOption[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [git, setGit] = useState<GitStatus>({ branch: null, changes: [] });
  const [resumed, setResumed] = useState(false);
  const [chats, setChats] = useState<ConversationMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [engines, setEngines] = useState<
    { id: string; label: string; installed: boolean }[]
  >([]);
  const [pluginCatalog, setPluginCatalog] = useState<NormalizedPlugin[]>([]);
  const [isSwitchingEngine, setIsSwitchingEngine] = useState(false);
  const [targetEngineId, setTargetEngineId] = useState<string | null>(null);

  // Safety net: `ready`/`auth-required`/`error` normally clear the switching
  // state, but if the server never answers (silent no-op, dropped socket) the
  // composer would sit on "Switching to …" forever. Give up after a while.
  useEffect(() => {
    if (!isSwitchingEngine) return;
    const timer = setTimeout(() => {
      setIsSwitchingEngine(false);
      setTargetEngineId(null);
    }, 20_000);
    return () => clearTimeout(timer);
  }, [isSwitchingEngine, targetEngineId]);
  const [isSettingConfig, setIsSettingConfig] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState<string | null>(null);
  const [pendingConfigValue, setPendingConfigValue] = useState<string | null>(null);
/** Pre-change config values, kept only until the agent confirms or refuses. */
const previousConfigRef = useRef<Record<string, string>>({});
/** `@file` mention results, and the query they answer (drops stale replies). */
const [fileMatches, setFileMatches] = useState<readonly string[]>([]);
  const fileQueryRef = useRef<string>("");

  /** Append to the current assistant turn, starting one if needed. */
  // The personas of the prompt in flight. The assistant turn is created later,
  // by the first update off the socket, and has no other way to know them.
  const personasRef = useRef<TurnPersona[] | undefined>(undefined);

  /**
   * Watchdog for a prompt the engine silently swallows — Antigravity does this
   * often enough that people learned to hit Stop and re-send. We do it for
   * them: the exact payload of the prompt in flight, whether any live (non
   * replay) update has landed since it went out, and how many times we have
   * already retried this one.
   */
  const lastPromptPayloadRef = useRef<string | null>(null);
  const sawUpdateSinceSendRef = useRef(true);
  const promptRetriesRef = useRef(0);
  const [awaitingFirstUpdate, setAwaitingFirstUpdate] = useState(false);
  const [stallNonce, setStallNonce] = useState(0);

  useEffect(() => {
    if (!awaitingFirstUpdate) return;
    const timer = setTimeout(() => {
      if (sawUpdateSinceSendRef.current) return;
      const socket = socketRef.current;
      const payload = lastPromptPayloadRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN || !payload) return;

      if (promptRetriesRef.current >= 1) {
        // Already retried once and still nothing — stop pretending it is
        // working and hand the turn back to the user.
        setAwaitingFirstUpdate(false);
        setBusy(false);
        setError("The agent didn't respond. Send your message again.");
        return;
      }

      promptRetriesRef.current += 1;
      // Cancel the dead turn, then re-send the identical payload — no new
      // bubble, the user turn is already in the transcript.
      socket.send(JSON.stringify({ type: "cancel" }));
      window.setTimeout(() => {
        const s = socketRef.current;
        if (sawUpdateSinceSendRef.current || s?.readyState !== WebSocket.OPEN) return;
        setBusy(true);
        setError(null);
        s.send(payload);
        // The cancel above lands a `turn-end` that stands the watchdog down —
        // re-arm it so a second stall on the retry is still caught.
        setAwaitingFirstUpdate(true);
        setStallNonce((n) => n + 1);
      }, 1_000);
    }, 60_000);
    return () => clearTimeout(timer);
  }, [awaitingFirstUpdate, stallNonce]);

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
          personas: personasRef.current,
        };
        return [...current, mutate(fresh)];
      });
    },
    [],
  );

  /**
   * Attachments already fetched: data URI, or null when the file is gone.
   *
   * A cache rather than an "already asked" set. Replay rebuilds the same turns more
   * than once (a chunked prompt, a reset-then-replay when switching chats),
   * and a set would suppress the refetch while the rebuilt turn had no image
   * left — which is exactly how a loaded thumbnail turned back into a
   * permanent placeholder.
   */
  const attachments = useRef(new Map<string, string | null>());
  const attachmentsInFlight = useRef(new Set<string>());

  /** Ask the server for one attachment's bytes; the reply patches the turn. */
  const requestAttachment = useCallback((path: string) => {
    if (attachments.current.has(path) || attachmentsInFlight.current.has(path)) {
      return;
    }
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    attachmentsInFlight.current.add(path);
    socket.send(JSON.stringify({ type: "read-attachment", path }));
  }, []);

  /** Append a user turn (used when replaying a resumed conversation). */
  const appendUserChunk = useCallback((text: string) => {
    setTurns((current) => {
      const last = current.at(-1);
      const merged = last?.role === "user" ? last.text + text : text;
      const split = splitAttachments(stripSystemPreamble(merged));
      // Anything already fetched is filled in here, so a turn rebuilt from a
      // later chunk keeps its thumbnails instead of flashing back to a box.
      const images = split.images.map((image) => {
        const cached = image.path ? attachments.current.get(image.path) : undefined;
        return cached === undefined
          ? image
          : cached === null
            ? { ...image, unavailable: true }
            : { ...image, previewUrl: cached };
      });
      const turn = {
        text: split.text,
        // `last.text` is already stripped, so re-parsing a continued prompt
        // finds no refs — keep the ones the first chunk carried.
        images:
          images.length > 0
            ? images
            : last?.role === "user"
              ? last.images
              : undefined,
      };
      // The bytes are on disk, not in the replay; ask for each one so the
      // thumbnail comes back instead of a path.
      for (const image of images) {
        if (image.path) requestAttachment(image.path);
      }
      if (last?.role === "user") {
        return [...current.slice(0, -1), { ...last, ...turn }];
      }
      return [
        ...current,
        { id: crypto.randomUUID(), role: "user", thought: "", tools: [], ...turn },
      ];
    });
  }, [requestAttachment]);

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
                diffs: toolDiffs(update.content) ?? rawInputDiffs(update.rawInput),
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
                diffs:
                  toolDiffs(update.content) ??
                  rawInputDiffs(update.rawInput) ??
                  tool.diffs,
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
        next.send(JSON.stringify({ type: "refresh-engines" }));
        next.send(JSON.stringify({ type: "refresh-plugins" }));
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
            setConfigOptions([...message.configOptions]);
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
            // A live update means the engine picked the prompt up — stand the
            // stall watchdog down.
            if (message.replay !== true) {
              sawUpdateSinceSendRef.current = true;
              setAwaitingFirstUpdate(false);
            }
            applyUpdate(message.update, message.replay === true, message.source);
            return;
          case "turn-end": {
            setAwaitingFirstUpdate(false);
            const usage = message.usage;
            if (usage) {
              withAssistantTurn((turn) => ({
                ...turn,
                usage: {
                  ...turn.usage,
                  totalTokens: usage.totalTokens,
                  inputTokens: usage.inputTokens,
                  outputTokens: usage.outputTokens,
                  thoughtTokens: usage.thoughtTokens ?? undefined,
                  cachedReadTokens: usage.cachedReadTokens ?? undefined,
                  cachedWriteTokens: usage.cachedWriteTokens ?? undefined,
                },
              }));
            }
            setBusy(false);
            return;
          }
          case "checkpoint":
            withAssistantTurn((turn) => ({
              ...turn,
              checkpoint: {
                checkpointId: message.checkpointId,
                reason: message.reason,
                summary: {
                  ...message.summary,
                  notes: [...message.summary.notes],
                },
              },
            }));
            return;
          case "chats":
            setChats([...message.chats]);
            if (message.activeSessionId)
              setActiveSessionId(message.activeSessionId);
            return;
          case "engines":
            setEngines([...message.engines]);
            return;
          case "plugin-catalog":
            setPluginCatalog([...message.plugins]);
            return;
          case "attachment": {
            const { path, dataUri } = message;
            attachments.current.set(path, dataUri);
            attachmentsInFlight.current.delete(path);
            setTurns((current) =>
              current.map((turn) =>
                turn.images?.some((image) => image.path === path)
                  ? {
                      ...turn,
                      images: turn.images.map((image) =>
                        image.path === path
                          ? dataUri
                            ? {
                                ...image,
                                previewUrl: dataUri,
                                unavailable: false,
                                mimeType:
                                  dataUri.slice(5, dataUri.indexOf(";")) ||
                                  image.mimeType,
                              }
                            : { ...image, unavailable: true }
                          : image,
                      ),
                    }
                  : turn,
              ),
            );
            return;
          }
          case "files":
            if (message.query === fileQueryRef.current) {
              setFileMatches([...message.files]);
            }
            return;
          case "reset":
            setTurns([]);
            return;
          case "auth-required":
            setAwaitingFirstUpdate(false);
            setIsSwitchingEngine(false);
            setTargetEngineId(null);
            // Deliberately NOT `setError`: this is a state with an action, and
            // routing it through the error toast is what left the user staring
            // at "Authentication required…" with nothing to click.
            setAuthRequired({
               engineId: message.engineId,
               engineLabel: message.engineLabel,
               message: message.message,
               methods: [...message.methods],
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
            setAwaitingFirstUpdate(false);
            setIsSwitchingEngine(false);
            setTargetEngineId(null);
            setIsSettingConfig(false);
            setPendingConfigId(null);
            setPendingConfigValue(null);
            if (isAuthRequiredError(message.message)) {
              const activeId = targetEngineId ?? engineId ?? "antigravity";
              setAuthRequired({
                engineId: activeId,
                engineLabel: engineLabel ?? engineLabelFallback(activeId),
                message: message.message,
                methods: authMethodsForEngine(activeId),
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
        personas?: TurnPersona[];
        images?: ChatImageAttachmentDraft[];
        plugins?: ActivePluginRef[];
      },
    ) => {
      const trimmed = text.trim();
      const images = opts?.images?.length ? opts.images : undefined;
      const socket = socketRef.current;
      if ((!trimmed && !images) || !socket || socket.readyState !== WebSocket.OPEN) return;

      setError(null);
      setBusy(true);
      personasRef.current = opts?.personas?.length ? opts.personas : undefined;
      setTurns((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          text: stripSystemPreamble(trimmed),
          mentions: opts?.mentions?.length ? opts.mentions : undefined,
          personas: personasRef.current,
          images: images?.map((image) => ({
            previewUrl: image.previewUrl,
            mimeType: image.mimeType,
            prompt: image.prompt,
          })),
          thought: "",
          tools: [],
        },
      ]);
      const payload = JSON.stringify({
          type: "prompt",
          text: trimmed,
          persona: opts?.persona,
          plugins: opts?.plugins?.length ? opts.plugins : undefined,
          images: images?.map((image) => ({
            data: image.base64,
            mimeType: image.mimeType,
            prompt: image.prompt,
          })),
        });
      lastPromptPayloadRef.current = payload;
      sawUpdateSinceSendRef.current = false;
      promptRetriesRef.current = 0;
      setAwaitingFirstUpdate(true);
      setStallNonce((n) => n + 1);
      socket.send(payload);
    },
    [],
  );

  const cancel = useCallback(() => {
    // A manual Stop ends the watchdog too — the user is now driving.
    setAwaitingFirstUpdate(false);
    sawUpdateSinceSendRef.current = true;
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

  const refreshPlugins = useCallback(() => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "refresh-plugins" }));
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
    pluginCatalog,
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
    refreshPlugins,
    newChat,
    openChat,
    updateTurnPlan,
  };
}
