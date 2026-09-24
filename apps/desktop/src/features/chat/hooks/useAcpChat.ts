import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  SessionConfigOption,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import type { EngineEntry, GitStatus, PermissionOption, ServerMessage, SessionModes, SetupConsent, TerminalKeyName } from "../../../../server/index.ts";
import type { NormalizedPlugin, ActivePluginRef } from "@weave/core/browser";
import {
  isAuthRequiredError,
  type EngineAuthMethod,
  type EngineAuthOperation,
} from "@weave/protocol";
import type { ChatImageAttachmentDraft } from "@/shared/types/messages";
import { flattenConfigValues, planExitTarget } from "@/shared/lib/sessionConfig";
import {
  authMethodsForEngine,
  engineLabelFallback,
} from "./acpChat/authErrorRecovery";
import {
  rawInputDiffs,
  sealRunningTools,
  splitAttachments,
  stripSystemPreamble,
  TERMINAL_STATUS,
  toolDiffs,
  toolText,
} from "./acpChat/messageParsing";
import {
  latestContextUsage,
  rememberCapability,
  useAutoCompactThreshold,
  type CompactionCapabilities,
} from "@/features/chat/compaction";
import { buildHistoryArchive, restoreArchivedTurns } from "./acpChat/history-archive";
import { appendTextSegment, appendToolSegment } from "./acpChat/turn-segments";
import { latestPlanEntries, planChangeEntries, planChanges } from "./acpChat/plan-changes";
import { useArchiveChannel } from "./acpChat/use-archive-channel";
import type { ArchiveChannelOptions } from "./acpChat/use-archive-channel";
import { useQuestionChannel } from "./question";
import { useRunChannel } from "@/features/runs";
import { useFileChannel } from "@/features/files";
import {
  applyCompactionSettled,
  applyCompactionStarted,
  applyCompactionUpdate,
  applyReplayedSummary,
  failRunningNotices,
  withdrawPromptTurn,
} from "./acpChat/compaction-turns";
import {
  readPreferredModeId,
  readPreferredModel,
  writePreferredModeId,
  writePreferredModel,
} from "./acpChat/session-preferences";
import type {
  ChatTurn,
  ConnectionState,
  ConversationMeta,
  PlanItem,
  TurnPersona,
  TurnPlan,
} from "./acpChat/types";

export type {
  ArchivedChatMeta,
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
  TurnSegment,
  TurnUsage,
  PlanChangeKind,
} from "./acpChat/types";
export { splitAttachments } from "./acpChat/messageParsing";
export { latestPlanEntries } from "./acpChat/plan-changes";
export type { SessionModes, SessionModeInfo, TerminalKeyName, SetupConsent, ConsentLink } from "../../../../server/index.ts";

const OPEN_CHAT_TIMEOUT_MS = 20_000;

/**
 * Stands in for the session id while a new chat is being created.
 *
 * The server names the session, so there is nothing to key the skeleton on
 * until it answers — and waiting for that name is exactly the pause this
 * removes. Any non-null value drives `isOpeningChat`.
 */
const NEW_CHAT_PENDING = "pending-new-chat";

const CONNECTION_LOST_DURING_COMPACTION = "Connection to the engine server closed during compaction.";
const PROMPT_WITHDRAWN_WITHOUT_DRAFT = "Compaction was cancelled, so your message was not sent. Send it again when ready.";

export interface ChatServerEndpoint {
  readonly port: number;
  readonly token: string;
}

const WEAVE_PROTOCOL = "weave.v1";
const TOKEN_PROTOCOL_PREFIX = "weave.token.";

function openServerSocket(port: number, token: string): WebSocket {
  return new WebSocket(`ws://127.0.0.1:${port}`, [WEAVE_PROTOCOL, `${TOKEN_PROTOCOL_PREFIX}${token}`]);
}

export interface EngineSetupPrompt {
  readonly engineId: string;
  readonly engineLabel: string;
  readonly description: string;
  readonly status: "needed" | "running" | "failed";
  readonly error: string | null;
  readonly lines: readonly string[];
  readonly consent: SetupConsent | null;
  readonly consentSubmitted: boolean;
}

export interface PermissionRequest {
  readonly requestId: string;
  readonly title: string;
  readonly kind: string;
  readonly command: string | null;
  readonly options: readonly PermissionOption[];
}

function latestUnarchivedNoticeId(turns: readonly ChatTurn[], archived: ReadonlySet<string>): string | null {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const notice = turns[index]?.compaction;
    if (!notice) continue;
    const isArchivable = notice.origin === "live" && notice.status === "completed";
    return isArchivable && !archived.has(notice.operationId) ? notice.operationId : null;
  }
  return null;
}

function sealTurns(turns: readonly ChatTurn[], endedAt: number): ChatTurn[] | null {
  let changed = false;
  const next = turns.map((turn) => {
    const tools = sealRunningTools(turn.tools, endedAt);
    if (tools === turn.tools) return turn;
    changed = true;
    return { ...turn, tools: [...tools] };
  });
  return changed ? next : null;
}

/**
 * Owns the WebSocket to the ACP server and folds `session/update`
 * notifications into a transcript the UI can render.
 *
 * Pass `null` for `server` while no project is chosen — the hook stays idle
 * rather than dialling a server that is not running yet.
 */
export function useAcpChat(server: ChatServerEndpoint | null, options: ArchiveChannelOptions = {}) {
  const port = server?.port ?? null;
  const token = server?.token ?? null;
  const socketRef = useRef<WebSocket | null>(null);
  const archive = useArchiveChannel(socketRef, options);
  const questionChannel = useQuestionChannel(socketRef);
  const runChannel = useRunChannel(socketRef);
  const fileChannel = useFileChannel(socketRef);
  const [state, setState] = useState<ConnectionState>("idle");
  const [cwd, setCwd] = useState<string | null>(null);
  const [engineId, setEngineId] = useState<string | null>(null);
  const engineIdRef = useRef<string | null>(null);
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
  const configOptionsRef = useRef<readonly SessionConfigOption[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, string>>({});
  const [git, setGit] = useState<GitStatus>({ branch: null, changes: [] });
  const [resumed, setResumed] = useState(false);
  const [chats, setChats] = useState<ConversationMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const [permissionRequest, setPermissionRequest] = useState<PermissionRequest | null>(null);
  const [modes, setModes] = useState<SessionModes | null>(null);
  const [engineSetup, setEngineSetup] = useState<EngineSetupPrompt | null>(null);
  const activeSessionIdRef = useRef<string | null>(null);
  const pendingOpenRef = useRef<{ readonly previousSessionId: string | null } | null>(null);
  const [engines, setEngines] = useState<EngineEntry[]>([]);
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
  const [compactionCapabilities, setCompactionCapabilities] = useState<CompactionCapabilities>(
    () => new Map(),
  );
  const [isCompacting, setIsCompacting] = useState(false);
  const compactingOperationRef = useRef<string | null>(null);
  const compactingPromptRef = useRef<string | null>(null);
  const manualCompactPendingRef = useRef(false);
  const withdrawHandlersRef = useRef(new Map<string, () => void>());
  const autoCompactThreshold = useAutoCompactThreshold();
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

  useEffect(() => {
    if (!openingSessionId) return;
    const timer = setTimeout(() => {
      pendingOpenRef.current = null;
      setOpeningSessionId(null);
    }, OPEN_CHAT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [openingSessionId]);

  const withAssistantTurn = useCallback(
    (mutate: (turn: ChatTurn, history: readonly ChatTurn[]) => ChatTurn) => {
      setTurns((current) => {
        const last = current.at(-1);
        if (last?.role === "assistant") {
          return [...current.slice(0, -1), mutate(last, current.slice(0, -1))];
        }
        const fresh: ChatTurn = {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "",
          thought: "",
          tools: [],
          personas: personasRef.current,
        };
        return [...current, mutate(fresh, current)];
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

      const compactingOperationId = compactingOperationRef.current;
      if (compactingOperationId && !replay) {
        setTurns((current) => applyCompactionUpdate(current, compactingOperationId, update) ?? current);
        return;
      }

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
            segments: appendTextSegment(turn.segments, chunk),
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
            segments: appendToolSegment(turn.segments, update.toolCallId),
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
          const at = replay ? undefined : Date.now();
          withAssistantTurn((turn, history) => {
            const nextEntries: PlanItem[] = (update.entries ?? []).map((entry, idx) => ({
              id: `plan-step-${idx + 1}`,
              content: entry.content,
              priority: entry.priority,
              status: entry.status,
            }));
            const changes = planChanges(latestPlanEntries([...history, turn]), nextEntries);
            const entries = planChangeEntries(turn.id, turn.tools.length, changes, at);
            return {
              ...turn,
              tools: [...turn.tools, ...entries],
              segments: entries.reduce((segments, entry) => appendToolSegment(segments, entry.id), turn.segments ?? []),
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
          return;
      }
    },
    [withAssistantTurn, appendUserChunk],
  );

  useEffect(() => {
    // Clear state from previous connections when port changes
    setTurns([]);
    configOptionsRef.current = [];
    setConfigOptions([]);
    setConfigValues({});
    engineIdRef.current = null;
    setEngineId(null);
    setEngineLabel(null);
    setError(null);
    setResumed(false);
    setChats([]);
    archive.reset();
    questionChannel.reset();
    setPermissionRequest(null);
    setModes(null);
    setEngineSetup(null);
    compactingOperationRef.current = null;
    compactingPromptRef.current = null;
    manualCompactPendingRef.current = false;
    withdrawHandlersRef.current.clear();
    setIsCompacting(false);
    setCompactionCapabilities(new Map());
    activeSessionIdRef.current = null;
    setActiveSessionId(null);
    pendingOpenRef.current = null;
    setOpeningSessionId(null);

    if (port == null || token == null) {
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
      const next = openServerSocket(port, token);
      socket = next;
      socketRef.current = next;

      next.onopen = () => {
        attempt = 0;
        next.send(JSON.stringify({ type: "refresh-engines" }));
        next.send(JSON.stringify({ type: "refresh-plugins" }));
      };

      next.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (archive.handleMessage(message)) return;
        if (questionChannel.handleMessage(message)) return;
        if (runChannel.handleMessage(message)) return;
        if (fileChannel.handleMessage(message)) return;
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
            engineIdRef.current = message.engineId;
            setEngineId(message.engineId);
            setEngineLabel(message.engineLabel);
            setResumed(message.resumed);
            activeSessionIdRef.current = message.sessionId;
            setActiveSessionId(message.sessionId);
            pendingOpenRef.current = null;
            setOpeningSessionId(null);
            // A fresh chat starts empty; a resumed one is wiped by the
            // preceding `reset` and rebuilt by the replay that follows.
            if (!message.resumed) setTurns([]);
            // A call the engine never closed before the transcript was saved
            // would otherwise spin forever every time the chat is reopened.
            setTurns((current) => sealTurns(current, Date.now()) ?? current);

            setModes(message.modes);
            configOptionsRef.current = message.configOptions;
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

            // A resumed chat keeps whatever mode/model it was left on. A
            // fresh one lands on the user's saved preference, falling back
            // to accept-edits so new chats don't default to Manual.
            if (!message.resumed) {
              const availableModeIds =
                message.modes?.availableModes.map((mode) => mode.id) ?? [];
              const desiredModeId =
                readPreferredModeId(message.engineId) ??
                planExitTarget(availableModeIds, "accept-edits");
              if (
                desiredModeId &&
                desiredModeId !== message.modes?.currentModeId &&
                availableModeIds.includes(desiredModeId)
              ) {
                setModes((current) =>
                  current ? { ...current, currentModeId: desiredModeId } : current,
                );
                next.send(JSON.stringify({ type: "set-mode", modeId: desiredModeId }));
              }

              const modelOption = message.configOptions.find(
                (option) =>
                  option.type === "select" &&
                  (option.category === "model" || option.id === "model"),
              );
              const preferredModel = readPreferredModel(message.engineId);
              if (
                modelOption &&
                modelOption.type === "select" &&
                preferredModel &&
                preferredModel !== modelOption.currentValue &&
                flattenConfigValues(modelOption).some((entry) => entry.value === preferredModel)
              ) {
                setConfigValues((current) => ({
                  ...current,
                  [modelOption.id]: preferredModel,
                }));
                next.send(
                  JSON.stringify({
                    type: "set-config",
                    configId: modelOption.id,
                    value: preferredModel,
                  }),
                );
              }
            }
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
            if (message.replay !== true && !compactingOperationRef.current) {
              sawUpdateSinceSendRef.current = true;
              setAwaitingFirstUpdate(false);
            }
            // The agent can switch its own mode mid-turn (Claude Code leaves
            // plan mode when a plan is approved); keep the picker honest.
            if (message.update.sessionUpdate === "current_mode_update") {
              const { currentModeId } = message.update;
              setModes((current) =>
                current ? { ...current, currentModeId } : current,
              );
            }
            applyUpdate(message.update, message.replay === true, message.source);
            return;
          case "turn-end": {
            withdrawHandlersRef.current.clear();
            setAwaitingFirstUpdate(false);
            setTurns((current) => sealTurns(current, Date.now()) ?? current);
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
            if (message.activeSessionId && !pendingOpenRef.current) {
              activeSessionIdRef.current = message.activeSessionId;
              setActiveSessionId(message.activeSessionId);
            }
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
          case "compaction": {
            if (message.sessionId !== activeSessionIdRef.current) return;
            if (message.status === "started") {
              compactingOperationRef.current = message.operationId;
              compactingPromptRef.current = message.promptId;
              manualCompactPendingRef.current = false;
              setIsCompacting(true);
              setAwaitingFirstUpdate(false);
              const startedAt = Date.now();
              setTurns((current) => applyCompactionStarted(current, message, startedAt) ?? current);
              return;
            }
            if (compactingOperationRef.current === message.operationId) {
              compactingOperationRef.current = null;
              compactingPromptRef.current = null;
              setIsCompacting(false);
            }
            manualCompactPendingRef.current = false;
            const settledAt = Date.now();
            setTurns((current) => applyCompactionSettled(current, message, settledAt) ?? current);
            if (message.status !== "cancelled" && lastPromptPayloadRef.current && !sawUpdateSinceSendRef.current) {
              setAwaitingFirstUpdate(true);
              setStallNonce((n) => n + 1);
            }
            return;
          }
          case "prompt-withdrawn": {
            setAwaitingFirstUpdate(false);
            setBusy(false);
            lastPromptPayloadRef.current = null;
            sawUpdateSinceSendRef.current = true;
            setTurns((current) => withdrawPromptTurn(current, message.promptId) ?? current);
            const onWithdrawn = withdrawHandlersRef.current.get(message.promptId);
            withdrawHandlersRef.current.delete(message.promptId);
            if (onWithdrawn) onWithdrawn();
            else setError(PROMPT_WITHDRAWN_WITHOUT_DRAFT);
            return;
          }
          case "history-archive":
            setTurns(restoreArchivedTurns(message.turns, message.droppedTurnCount));
            return;
          case "compaction-summary": {
            const noticeId = crypto.randomUUID();
            const restoredAt = Date.now();
            setTurns((current) =>
              applyReplayedSummary(current, { summary: message.summary, noticeId, now: restoredAt }),
            );
            return;
          }
          case "session-capabilities":
            setCompactionCapabilities((current) =>
              rememberCapability(current, message.sessionId, message.supportsCompaction),
            );
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
          case "permission-request":
            setPermissionRequest({
              requestId: message.requestId,
              title: message.title,
              kind: message.kind,
              command: message.command,
              options: [...message.options],
            });
            return;
          case "modes":
            setModes(message.modes);
            return;
          case "policy-block":
            // The agent asked, Weave said no, and no card was ever shown. Mark
            // the tool so the transcript can say why it did nothing.
            withAssistantTurn((turn) => ({
              ...turn,
              tools: turn.tools.map((tool) =>
                tool.id === message.toolCallId
                  ? { ...tool, blockedReason: message.reason }
                  : tool,
              ),
            }));
            return;
          case "setup-required":
            setEngineSetup({
              engineId: message.engineId,
              engineLabel: message.engineLabel,
              description: message.description,
              status: "needed",
              error: null,
              lines: [],
              consent: null,
              consentSubmitted: false,
            });
            return;
          case "setup-state":
            if (message.status === "succeeded") {
              setEngineSetup(null);
              return;
            }
            setEngineSetup((current) =>
              current && current.engineId === message.engineId
                ? {
                    ...current,
                    status: message.status === "running" ? "running" : "failed",
                    error: message.error,
                  }
                : current,
            );
            return;
          case "setup-consent":
            setEngineSetup((current) =>
              current && current.engineId === message.engineId
                ? { ...current, consent: message.consent }
                : current,
            );
            return;
          case "setup-output":
            setEngineSetup((current) =>
              current && current.engineId === message.engineId
                ? { ...current, lines: [...message.lines] }
                : current,
            );
            return;
          case "permission-cancelled":
            setPermissionRequest((current) =>
              current?.requestId === message.requestId ? null : current,
            );
            return;
          case "error":
            setAwaitingFirstUpdate(false);
            if (pendingOpenRef.current) {
              activeSessionIdRef.current = pendingOpenRef.current.previousSessionId;
              setActiveSessionId(pendingOpenRef.current.previousSessionId);
              pendingOpenRef.current = null;
              setOpeningSessionId(null);
            }
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
        const heldPromptId = compactingOperationRef.current ? compactingPromptRef.current : null;
        const restoreHeldPrompt = heldPromptId ? withdrawHandlersRef.current.get(heldPromptId) : undefined;
        compactingOperationRef.current = null;
        compactingPromptRef.current = null;
        manualCompactPendingRef.current = false;
        withdrawHandlersRef.current.clear();
        setIsCompacting(false);
        const closedAt = Date.now();
        setTurns((current) => {
          const failed = failRunningNotices(current, CONNECTION_LOST_DURING_COMPACTION, closedAt) ?? current;
          const withdrawn = heldPromptId ? withdrawPromptTurn(failed, heldPromptId) ?? failed : failed;
          return sealTurns(withdrawn, Date.now()) ?? withdrawn;
        });
        restoreHeldPrompt?.();
        pendingOpenRef.current = null;
        setOpeningSessionId(null);
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
  }, [applyUpdate, withAssistantTurn, port, token, archive.handleMessage, archive.reset, questionChannel.handleMessage, questionChannel.reset, runChannel.handleMessage, fileChannel.handleMessage]);

  const latestUsage = latestContextUsage(turns);
  const contextUsed = latestUsage?.contextTokens;
  const contextSize = latestUsage?.contextLimit;
  const contextUsage = useMemo(
    () =>
      contextUsed === undefined || contextSize === undefined
        ? null
        : { contextTokens: contextUsed, contextLimit: contextSize },
    [contextUsed, contextSize],
  );
  const isCompactSupported =
    activeSessionId !== null && compactionCapabilities.get(activeSessionId) === true;

  const archivedNoticeIdsRef = useRef(new Set<string>());
  const unarchivedNoticeId = latestUnarchivedNoticeId(turns, archivedNoticeIdsRef.current);
  useEffect(() => {
    const socket = socketRef.current;
    if (!unarchivedNoticeId || !activeSessionId || socket?.readyState !== WebSocket.OPEN) return;
    const archive = buildHistoryArchive(turns, unarchivedNoticeId);
    archivedNoticeIdsRef.current.add(unarchivedNoticeId);
    if (!archive) return;
    socket.send(JSON.stringify({ type: "save-history", sessionId: activeSessionId, ...archive }));
  }, [unarchivedNoticeId, activeSessionId, turns]);

  const send = useCallback(
    (
      text: string,
      opts?: {
        persona?: string;
        mentions?: string[];
        personas?: TurnPersona[];
        images?: ChatImageAttachmentDraft[];
        plugins?: ActivePluginRef[];
        onWithdrawn?: () => void;
      },
    ) => {
      const trimmed = text.trim();
      const images = opts?.images?.length ? opts.images : undefined;
      const socket = socketRef.current;
      if ((!trimmed && !images) || !socket || socket.readyState !== WebSocket.OPEN) return;

      const promptId = crypto.randomUUID();
      if (opts?.onWithdrawn) withdrawHandlersRef.current.set(promptId, opts.onWithdrawn);
      setError(null);
      setBusy(true);
      personasRef.current = opts?.personas?.length ? opts.personas : undefined;
      setTurns((current) => [
        ...current,
        {
          id: promptId,
          role: "user",
          text: stripSystemPreamble(trimmed),
          createdAt: Date.now(),
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
          promptId,
          autoCompactThreshold,
          persona: opts?.persona,
          personaIds: personasRef.current?.map((persona) => persona.id),
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
      if (!compactingOperationRef.current) {
        setAwaitingFirstUpdate(true);
        setStallNonce((n) => n + 1);
      }
      socket.send(payload);
    },
    [autoCompactThreshold],
  );

  const compact = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (compactingOperationRef.current || manualCompactPendingRef.current) return;
    manualCompactPendingRef.current = true;
    setError(null);
    socket.send(JSON.stringify({ type: "compact", operationId: crypto.randomUUID() }));
  }, []);

  const startEngineSetup = useCallback((engineId: string) => {
    socketRef.current?.send(JSON.stringify({ type: "start-setup", engineId }));
  }, []);

  const cancelEngineSetup = useCallback(() => {
    socketRef.current?.send(JSON.stringify({ type: "cancel-setup" }));
    setEngineSetup((current) =>
      current
        ? { ...current, status: "needed", lines: [], consent: null, consentSubmitted: false }
        : current,
    );
  }, []);

  const submitSetupConsent = useCallback((agreed: boolean) => {
    socketRef.current?.send(JSON.stringify({ type: "submit-setup-consent", agreed }));
    setEngineSetup((current) => (current ? { ...current, consentSubmitted: true } : current));
  }, []);

  const sendSetupKey = useCallback((key: TerminalKeyName) => {
    socketRef.current?.send(JSON.stringify({ type: "submit-setup-key", key }));
  }, []);

  const setMode = useCallback((modeId: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN || compactingOperationRef.current) return;
    // Optimistic: the agent confirms with a `modes` message, and a refusal
    // re-sends whatever it actually has.
    setModes((current) => (current ? { ...current, currentModeId: modeId } : current));
    if (engineIdRef.current) writePreferredModeId(engineIdRef.current, modeId);
    socket.send(JSON.stringify({ type: "set-mode", modeId }));
  }, []);

  const answerPermission = useCallback((requestId: string, optionId: string | null) => {
    setPermissionRequest((current) =>
      current?.requestId === requestId ? null : current,
    );
    socketRef.current?.send(
      JSON.stringify({ type: "permission-response", requestId, optionId }),
    );
  }, []);

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

  const submitAuthInput = useCallback((text: string) => {
    socketRef.current?.send(JSON.stringify({ type: "submit-auth-input", text }));
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
    if (!socket || socket.readyState !== WebSocket.OPEN || compactingOperationRef.current) return;
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
    if (!socket || socket.readyState !== WebSocket.OPEN || compactingOperationRef.current) return;

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

    const option = configOptionsRef.current.find((entry) => entry.id === configId);
    const isModelOption = option?.category === "model" || option?.id === "model";
    if (engineIdRef.current && isModelOption) {
      writePreferredModel(engineIdRef.current, value);
    }

    socket.send(JSON.stringify({ type: "set-config", configId, value }));
  }, []);

  const newChat = useCallback((instructions?: string) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    setBusy(false);
    setError(null);
    // Same opening sequence as `openChat`: drop the old transcript and show the
    // skeleton now, rather than leaving the previous chat on screen until the
    // server answers. `ready` clears both.
    setTurns([]);
    pendingOpenRef.current = { previousSessionId: activeSessionIdRef.current };
    activeSessionIdRef.current = null;
    setActiveSessionId(null);
    setOpeningSessionId(NEW_CHAT_PENDING);
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
      setTurns([]);
      pendingOpenRef.current = { previousSessionId: activeSessionIdRef.current };
      activeSessionIdRef.current = sessionId;
      setActiveSessionId(sessionId);
      setOpeningSessionId(sessionId);
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
    archive,
    activeSessionId,
    permissionRequest,
    answerPermission,
    question: questionChannel.question,
    answerQuestion: questionChannel.answer,
    startRun: runChannel.startRun,
    cancelRun: runChannel.cancelRun,
    openFile: fileChannel.openFile,
    modes,
    setMode,
    engineSetup,
    startEngineSetup,
    cancelEngineSetup,
    sendSetupKey,
    submitSetupConsent,
    isOpeningChat: openingSessionId !== null,
    send,
    compact,
    isCompacting,
    isCompactSupported,
    contextUsage,
    switchEngine,
    isSwitchingEngine,
    targetEngineId,
    authRequired,
    authOperation,
    startAuth,
    cancelAuth,
    submitAuthInput,
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
