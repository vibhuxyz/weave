import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SearchIcon,
  ActivityIcon,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { JumpToLatestButton } from "@/shared/ui/jump-to-latest-button";
import { usePersistedState } from "@/shared/hooks/usePersistedState";
import { useResizableSidebar } from "@/shared/hooks/useResizableSidebar";
import { useTextareaAutosize } from "@/shared/hooks/useTextareaAutosize";
import { cn } from "@/shared/lib/cn";
import { flattenConfigValues, splitConfigOptions } from "@/shared/lib/sessionConfig";
import { Message, MessageContent } from "@/shared/ui/ai-elements/message";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { ENGINES, DEFAULT_ENGINE_ID } from "@weave/agent/engines-registry.ts";
import { ConfigPicker } from "./ConfigPicker";
import { EnginePicker } from "./EnginePicker";
import { ProvidersDialog } from "./ProvidersDialog";
import { ContextPanel } from "./ContextPanel";
import { Sidebar } from "./Sidebar";
import { CreateProjectDialog, toneColor } from "./CreateProjectDialog";
import { AgentsView } from "./agents/AgentsView";
import { AgentAvatar } from "./agents/AgentAvatar";
import {
  useAgents,
  formatPersonaSystemPrompt,
  type Agent,
} from "./useAgents";
import { AgentMessage } from "./agent/components/AgentMessage";
import { EngineAuthPanel } from "@/features/auth/EngineAuthPanel";
import { ThinkingBlock } from "./agent/components/ThinkingBlock";
import { UserMessage } from "./UserMessage";
import { HomeView } from "./home/canvas/ui/HomeView";
import { basename } from "./paths";
import { useAcpChat } from "./useAcpChat";
import { useProject } from "./useProject";
import { useProjects, type ProjectEntry } from "./useProjects";
import { useRunningServers } from "./useRunningServers";
import { UsageLimitIsland, useQuotaStore } from "./features/quota/UsageLimitIsland";

function QuotaButton({ engineId }: { engineId: string | null | undefined }) {
  const isQuotaOpen = useQuotaStore((s) => s.isOpen);
  return (
    <button
      type="button"
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent",
        isQuotaOpen && "bg-secondary/60 text-foreground"
      )}
      onClick={() => {
        if (isQuotaOpen) {
          useQuotaStore.getState().hideQuota();
        } else {
          useQuotaStore.getState().showQuota(engineId || "");
        }
      }}
      aria-label="View Usage Limits"
    >
      <ActivityIcon className="size-4" />
    </button>
  );
}

export function App() {
  const [providersDialogOpen, setProvidersDialogOpen] = useState(false);
  const { state: project, choose, startWith } = useProject();
  const port = project.status === "running" ? project.port : null;
  // Ported from Berd's onboarding gate: Home never requires a project — it's
  // seeded and browsable on its own. Chat and the project-scoped chrome
  // (header title, sidebar's active row, context panel) fall back to "no
  // project yet" instead of blocking the whole app behind a folder picker.
  const activeDir = project.status === "running" ? project.dir : undefined;
  const {
    state: connection,
    turns,
    engineId,
    engineLabel,
    busy,
    error,
    configOptions,
    configValues,
    git,
    engines,
    chats,
    activeSessionId,
    send,
    switchEngine,
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
    refreshGit,
    newChat,
    openChat,
  } = useAcpChat(port);

  const { projects, remember, setProjectAgents, forget } = useProjects();
  const { agents } = useAgents();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<
    ProjectEntry | null
  >(null);
  const [previewTint, setPreviewTint] = useState<string>();
  // Manual agents the user turned on for the next new chat.
  const [manualActive, setManualActive] = useState<string[]>([]);

  const activeProjectEntry =
    project.status === "running"
      ? projects.find((p) => p.dir === project.dir)
      : undefined;
  const [view, setView] = usePersistedState<"home" | "chat" | "agents">(
    "berd:view",
    "home",
    // Legacy "chat" (pre-home-split) starts at home rather than a blank
    // transcript; "agents" is preserved.
    (v, d) => (v === "home" || v === "agents" ? v : d),
  );

  // Opening or starting a chat always drops the Agents view so the transcript
  // is actually visible. Neither has anything to run against without a
  // project — send the user to the folder picker instead of a dead chat.
  const startNewChat = useCallback(() => {
    if (project.status !== "running") {
      void choose();
      return;
    }
    setView("chat");
    newChat();
    setManualActive([]);
  }, [project, choose, newChat, setView]);
  const openChatAndShow = useCallback(
    (sessionId: string) => {
      setView("chat");
      // Already the active chat with its transcript loaded — just show it.
      if (sessionId === activeSessionId && turns.length > 0) return;
      openChat(sessionId);
    },
    [openChat, setView, activeSessionId, turns.length],
  );

  const { servers, stop: stopServer } = useRunningServers(
    turns,
    project.status === "running" ? project.dir : undefined,
  );

  // Keep the running project at the top of the sidebar list.
  useEffect(() => {
    if (project.status === "running") {
      remember(project.dir, project.engineId);
    }
  }, [project, remember]);

  // A model a chosen agent asked for, applied once its config options arrive.
  const pendingAgentModel = useRef<string | null>(null);

  const handleChatWithAgent = useCallback(
    (agent: Agent) => {
      const running = project.status === "running";
      if (!running) {
        // No project to run the agent against yet — same deferral as
        // `startNewChat`.
        void choose();
        return;
      }
      setView("chat");
      pendingAgentModel.current = agent.model ?? null;
      const currentEngine = project.engineId;
      // The picked agent rides every prompt of the new chat.
      setManualActive([agent.id]);
      if (agent.engineId && agent.engineId !== currentEngine) {
        void startWith(project.dir, agent.engineId);
        setTimeout(() => newChat(), 400);
      } else {
        newChat();
      }
    },
    [project, choose, startWith, newChat, setView],
  );

  /** What this agent advertises, sorted into the composer's three slots. */
  const {
    model: modelOption,
    primary: primaryConfigOption,
    children: childConfigOptions,
  } = useMemo(() => splitConfigOptions(configOptions), [configOptions]);

  useEffect(() => {
    const want = pendingAgentModel.current;
    if (!want) return;
    if (!modelOption) return;
    const match = flattenConfigValues(modelOption).find(
      (entry) =>
        entry.value === want || entry.name.toLowerCase() === want.toLowerCase(),
    );
    if (match) setConfig(modelOption.id, match.value);
    pendingAgentModel.current = null;
  }, [modelOption, setConfig]);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { resetHeight: resetComposerHeight } = useTextareaAutosize({
    textareaRef,
    value: draft,
    getMaxHeightPx: () => 200,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  const [installingEngine, setInstallingEngine] = useState(false);

  // Collapse state survives restarts (berd persists this too).
  const [panels, setPanels] = usePersistedState(
    "berd:shell:panels",
    { sidebar: true, context: true },
    (value, defaults) => {
      const v = value as Partial<typeof defaults> | null;
      return v &&
        typeof v.sidebar === "boolean" &&
        typeof v.context === "boolean"
        ? { sidebar: v.sidebar, context: v.context }
        : defaults;
    },
  );
  const sidebarOpen = panels.sidebar;
  const contextOpen = panels.context;
  const setSidebarOpen = useCallback(
    (next: boolean | ((v: boolean) => boolean)) =>
      setPanels((p) => ({
        ...p,
        sidebar: typeof next === "function" ? next(p.sidebar) : next,
      })),
    [setPanels],
  );
  const setContextOpen = useCallback(
    (next: boolean | ((v: boolean) => boolean)) =>
      setPanels((p) => ({
        ...p,
        context: typeof next === "function" ? next(p.context) : next,
      })),
    [setPanels],
  );

  const collapseSidebar = useCallback(
    () => setSidebarOpen(false),
    [setSidebarOpen],
  );
  const sidebarResize = useResizableSidebar(collapseSidebar);

  const onTranscriptScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
  }, []);

  const jumpToLatest = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleInstallEngine = async (packageName: string) => {
    setInstallingEngine(true);
    try {
      await invoke("install_engine", { packageName });
      const targetEngineId = project.status === "running" ? project.engineId : engineId;
      if ("dir" in project) {
        void startWith(project.dir, targetEngineId || DEFAULT_ENGINE_ID);
      }
    } catch (e) {
      console.error(e);
      alert(`Failed to install: ${String(e)}`);
    } finally {
      setInstallingEngine(false);
    }
  };

  useEffect(() => {
    // Only follow the stream if the user is already at the live edge —
    // otherwise scrolling up to read is fought by every new chunk.
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [turns]);

  // @-mentioned agents applied to the *next* message only.
  const [mentioned, setMentioned] = useState<Agent[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  // A query with a "/" or "." is a path — `@src/App.tsx` — so the menu shows
  // files instead of agents.
  const fileMode = mentionQuery !== null && /[./]/.test(mentionQuery);
  const mentionMatches =
    mentionQuery === null || fileMode
      ? []
      : agents
          .filter(
            (a) =>
              !mentioned.some((m) => m.id === a.id) &&
              a.name.toLowerCase().includes(mentionQuery.toLowerCase()),
          )
          .slice(0, 6);

  useEffect(() => {
    if (fileMode && mentionQuery !== null) requestFiles(mentionQuery);
    else clearFileMatches();
  }, [fileMode, mentionQuery, requestFiles, clearFileMatches]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const m = /(?:^|\s)@([\w./-]*)$/.exec(value.slice(0, caret));
    setMentionQuery(m ? m[1] : null);
    setMentionIndex(0);
  };

  const editPrompt = (text: string) => {
    onDraftChange(text);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(text.length, text.length);
    });
  };

  const pickMention = (agent: Agent) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft
      .slice(0, caret)
      .replace(/(?:^|\s)@([\w./-]*)$/, (full) => full.replace(/@[\w./-]*$/, ""));
    setDraft(before + draft.slice(caret));
    setMentioned((cur) => [...cur, agent]);
    setMentionQuery(null);
    requestAnimationFrame(() => el?.focus());
  };

  // A file mention is literal text the agent should see — `@src/App.tsx` — not
  // a pill. Swap the partial query for the full path and keep typing.
  const pickFile = (path: string) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft
      .slice(0, caret)
      .replace(/@([\w./-]*)$/, `@${path} `);
    const next = before + draft.slice(caret);
    setDraft(next);
    setMentionQuery(null);
    clearFileMatches();
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(before.length, before.length);
    });
  };

  const submit = () => {
    // Standing agents (`always` + manually toggled) plus this message's
    // @-mentions ride every prompt, so the persona can't drift over a chat.
    // The server merges this with the skills catalog into one <system> block.
    const persona = formatPersonaSystemPrompt(activeProjectEntry?.agents, agents, [
      ...manualActive,
      ...mentioned.map((a) => a.id),
    ]);
    send(draft, {
      persona,
      mentions: mentioned.map((a) => a.name),
    });
    setDraft("");
    setMentioned([]);
    setMentionQuery(null);
    resetComposerHeight();
  };

  // Home doesn't need a project — ported from Berd, which never gates on
  // one either (see the onboarding port's step 7). A project is only
  // required once the user actually tries to chat; `startNewChat` and
  // `handleChatWithAgent` send them to `choose()` at that point instead.

  const ready = connection === "ready";

  const engineName =
    engineLabel ||
    ENGINES[
      (project.status === "running" ? project.engineId : null) ||
        engineId ||
        DEFAULT_ENGINE_ID
    ]?.label ||
    "Agent";
  const iconBtn =
    "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";

  // Tint the ambient dot-grid — the create dialog's live preview wins, then the
  // active project's saved colour (berd behaviour).
  const projectTint =
    previewTint ??
    toneColor(projects.find((p) => p.dir === activeDir)?.tint) ??
    "transparent";

  return (
    <div
      data-app-shell-root="true"
      className="bg-dot-grid flex h-dvh flex-col text-foreground"
      style={{ "--project-tint": projectTint } as CSSProperties}
    >
      <UsageLimitIsland />
      {/* ── Top bar: window drag surface + shell chrome ───────────────── */}
      <header
        data-tauri-drag-region
        className="flex h-[var(--spacing-app-top-bar)] shrink-0 select-none items-center gap-2 pr-4"
      >
        <div className="h-full w-[var(--spacing-app-top-bar-leading)] shrink-0" />
        <button
          type="button"
          className={iconBtn}
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          <PanelLeftIcon className="size-4" />
        </button>
        <div className="flex items-center gap-0.5">
          <button type="button" className={iconBtn} disabled aria-label="Back">
            <ArrowLeftIcon className="size-4" />
          </button>
          <button type="button" className={iconBtn} disabled aria-label="Forward">
            <ArrowRightIcon className="size-4" />
          </button>
        </div>
        <span className="min-w-0 flex-1 truncate text-[length:var(--text-app-top-bar-title)] text-foreground">
          {activeDir ? basename(activeDir) : "Weave"}
        </span>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {activeDir && !ready && (
            <span className="text-muted-foreground">{connection}</span>
          )}
          {project.status === "error" && (
            <span className="text-destructive">{project.message}</span>
          )}
          {activeDir && <QuotaButton engineId={engineId || (project.status === "running" ? project.engineId : null)} />}
          <button type="button" className={iconBtn} disabled aria-label="Search">
            <SearchIcon className="size-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
            disabled={view !== "chat"}
            onClick={() => setContextOpen((v) => !v)}
            aria-label={contextOpen ? "Hide context panel" : "Show context panel"}
          >
            <PanelRightIcon className="size-4" />
          </button>
        </div>
      </header>

      {/* ── Body: three floating panels over the dot grid ─────────────── */}
      <div className="flex min-h-0 flex-1 gap-[var(--spacing-app-panel-gutter-inline)] px-[var(--spacing-app-panel-gutter-inline)] pt-[var(--spacing-app-panel-gutter-bottom)] pb-[var(--spacing-app-panel-gutter-bottom)]">
        <div
          className={cn(
            "relative shrink-0 self-start",
            sidebarResize.resizing
              ? "transition-none"
              : "transition-[width] duration-200 ease-out",
          )}
          style={{ width: sidebarOpen ? sidebarResize.width : 0 }}
        >
          <div
            className="overflow-hidden transition-opacity duration-200"
            style={{
              width: sidebarResize.width,
              opacity: sidebarOpen ? 1 : 0,
            }}
          >
            <Sidebar
              projects={projects}
              activeProjectDir={activeDir}
              onSelectProject={(dir) => {
                const entry = projects.find((p) => p.dir === dir);
                if (dir !== activeDir) void startWith(dir, entry?.engineId);
              }}
              onAddProject={() => {
                setEditingProject(null);
                setCreateOpen(true);
              }}
              onEditProject={(entry) => {
                setEditingProject(entry);
                setCreateOpen(true);
              }}
              onRemoveProject={(dir) => {
                forget(dir);
                if (dir === activeDir) {
                  const next = projects.find((p) => p.dir !== dir);
                  if (next) void startWith(next.dir, next.engineId);
                }
              }}
              chats={chats}
              activeSessionId={activeSessionId}
              onSelectChat={openChatAndShow}
              onNewChat={startNewChat}
              view={view}
              onViewChange={setView}
            />
          </div>
          {sidebarOpen && (
            <div
              onMouseDown={sidebarResize.onResizeStart}
              onDoubleClick={sidebarResize.onResizeDoubleClick}
              className="group absolute top-0 bottom-0 -right-1.5 z-20 w-3 cursor-ew-resize"
              aria-hidden
            >
              <div className="absolute top-1/2 left-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition-colors group-hover:bg-border" />
            </div>
          )}
        </div>

        {/* Full-bleed on the shell's dot grid. The panel used to be a raised
            card, which boxed Home's canvas and the Agents grid inside a second
            surface — the sidebar is the only chrome that should read as one. */}
        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {view === "agents" ? (
          <AgentsView onChat={handleChatWithAgent} engines={engines} />
        ) : (
        <>
        {view === "home" ? (
          <HomeView
            onOpenAgent={(id) => { const a = agents.find((x) => x.id === id); if (a) handleChatWithAgent(a); }}
            onCreateProject={() => {
              setEditingProject(null);
              setCreateOpen(true);
            }}
            onStartChat={startNewChat}
          />
        ) : (
        <div
          ref={scrollRef}
          onScroll={onTranscriptScroll}
          className="mx-auto flex w-full flex-1 flex-col gap-6 overflow-y-auto px-[var(--spacing-app-panel-gutter-inline)] py-6"
        >
          {turns.length === 0 && ready && (
            <p className="mt-16 text-center text-sm text-muted-foreground">
              Send a message to start this chat.
            </p>
          )}
          {turns.map((turn) => (
            <Message key={turn.id} from={turn.role}>
              <MessageContent>
                {turn.role === "assistant" ? (
                  <>
                    {(turn.thought ||
                      (busy &&
                        turn === turns.at(-1) &&
                        !turn.text &&
                        turn.tools.length === 0)) && (
                      <ThinkingBlock
                        text={turn.thought}
                        streaming={
                          busy && !turn.text && turn.tools.length === 0
                        }
                      />
                    )}
                    {(turn.text || turn.tools.length > 0) && (
                      <AgentMessage
                      turn={turn}
                      projectDir={activeDir ?? ""}
                      git={git}
                      configValues={configValues}
                      engineId={engineId!}
                      engineLabel={engineLabel!}
                      running={busy}
                      onAction={(action) => {
                        console.log("Action dispatched:", action);
                        switch (action.type) {
                          case "send_message":
                            send(action.text);
                            break;
                          case "cancel_run":
                            cancel();
                            break;
                          case "continue_with_engine":
                            if ("dir" in project) {
                              void startWith(project.dir, action.engineId);
                            }
                            break;
                        }
                      }}
                      onSend={send}
                    />
                    )}
                  </>
                ) : (
                  <UserMessage
                    text={turn.text}
                    mentions={turn.mentions}
                    onEdit={editPrompt}
                  />
                )}
              </MessageContent>
            </Message>
          ))}

          {busy && turns.at(-1)?.role === "user" && (
            <Message from="assistant">
              <MessageContent>
                <ThinkingBlock text="" streaming />
              </MessageContent>
            </Message>
          )}

          {authRequired && (
            <EngineAuthPanel
              engineLabel={authRequired.engineLabel}
              message={authRequired.message}
              methods={authRequired.methods}
              operation={
                authOperation?.engineId === authRequired.engineId
                  ? authOperation
                  : null
              }
              onStart={(methodId) => startAuth(authRequired.engineId, methodId)}
              onCancel={cancelAuth}
              onDismiss={clearAuth}
            />
          )}

          {error && (() => {
            const match = error.match(/is not installed \((.*?)\)/);
            return (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
                <p className="whitespace-pre-wrap">{error.split("\n")[0]}</p>
                {match && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="shrink-0 bg-background/50 hover:bg-background/80"
                    onClick={() => handleInstallEngine(match[1])}
                    disabled={installingEngine}
                  >
                    {installingEngine ? "Installing…" : "Install"}
                  </Button>
                )}
              </div>
            );
          })()}
          <div ref={bottomRef} />
        </div>
        )}

        {!atBottom && turns.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-32 z-10 flex justify-center">
            <JumpToLatestButton
              size="sm"
              onClick={jumpToLatest}
              className="pointer-events-auto gap-1"
            >
              <ChevronDownIcon className="size-4" />
              Jump to latest
            </JumpToLatestButton>
          </div>
        )}

        <div
          className={cn(
            "relative z-10 mt-auto w-full pb-6",
            view === "home"
              ? "ml-auto max-w-md px-[var(--spacing-app-panel-gutter-inline)]"
              : "px-[var(--spacing-app-panel-gutter-inline)]",
          )}
        >
          <div className="relative flex flex-col gap-2.5 rounded-composer bg-surface-chat-composer p-3 [-webkit-backdrop-filter:var(--backdrop-composer-glass)] [backdrop-filter:var(--backdrop-composer-glass)]">
            {mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-2xl border border-agent-border bg-agent-surface-raised p-2 shadow-[0_20px_56px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-1 px-1 pb-2 text-sm">
                  <span className="rounded-full bg-agent-surface-hover px-3 py-1 text-agent-text-bright">
                    Agents <span className="text-agent-text-faint">@</span>
                  </span>
                  <span className="px-2 py-1 text-agent-text-faint">
                    Files @
                  </span>
                  <span className="px-2 py-1 text-agent-text-faint">
                    Skills /
                  </span>
                </div>
                {mentionMatches.map((a, i) => (
                  <button
                    key={a.id}
                    type="button"
                    onMouseEnter={() => setMentionIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickMention(a);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm",
                      i === mentionIndex && "bg-agent-surface-hover",
                    )}
                  >
                    <AgentAvatar
                      name={a.name}
                      tint={a.tint}
                      icon={a.icon}
                      size="sm"
                      className="size-7 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate text-agent-text-bright">
                      {a.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {fileMode && fileMatches.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-96 overflow-hidden rounded-2xl border border-agent-border bg-agent-surface-raised p-2 shadow-[0_20px_56px_rgba(0,0,0,0.5)]">
                <div className="px-2 pb-2 text-xs text-agent-text-faint">
                  Files matching “{mentionQuery}”
                </div>
                {fileMatches.map((path, i) => (
                  <button
                    key={path}
                    type="button"
                    onMouseEnter={() => setMentionIndex(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickFile(path);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left font-mono text-xs",
                      i === mentionIndex && "bg-agent-surface-hover",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-agent-text-bright">
                      {path}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {mentioned.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {mentioned.map((a) => (
                  <span
                    key={a.id}
                    className="flex items-center gap-1 rounded-full bg-agent-accent-wash px-2 py-0.5 text-agent-accent text-xs"
                  >
                    @{a.name}
                    <button
                      type="button"
                      onClick={() =>
                        setMentioned((cur) => cur.filter((m) => m.id !== a.id))
                      }
                      className="hover:text-foreground"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (fileMode && fileMatches.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setMentionIndex((i) => (i + 1) % fileMatches.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setMentionIndex(
                      (i) => (i - 1 + fileMatches.length) % fileMatches.length,
                    );
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    pickFile(fileMatches[mentionIndex] ?? fileMatches[0]);
                    return;
                  }
                  if (event.key === "Escape") {
                    setMentionQuery(null);
                    clearFileMatches();
                    return;
                  }
                }
                if (mentionMatches.length > 0) {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setMentionIndex((i) => (i + 1) % mentionMatches.length);
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setMentionIndex(
                      (i) => (i - 1 + mentionMatches.length) % mentionMatches.length,
                    );
                    return;
                  }
                  if (event.key === "Enter" || event.key === "Tab") {
                    event.preventDefault();
                    pickMention(
                      mentionMatches[mentionIndex] ?? mentionMatches[0],
                    );
                    return;
                  }
                }
                if (event.key === "Escape" && mentionQuery !== null) {
                  setMentionQuery(null);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={`Chat with ${ready && engineLabel ? engineLabel : "Agent"}…`}
              rows={1}
              disabled={!ready}
              className="min-h-[44px] max-h-[200px] w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm leading-relaxed outline-none placeholder:text-placeholder-composer focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex flex-wrap items-center gap-2">
                <EnginePicker
                  selectedEngineId={engineId || (project.status === "running" ? project.engineId : null) || undefined}
                  engines={engines}
                  modelOption={modelOption}
                  modelValue={modelOption ? configValues[modelOption.id] : undefined}
                  loading={project.status === "starting"}
                  onSelectModel={setConfig}
                  onSelect={(id) => {
                    const currentId =
                      engineId ||
                      (project.status === "running" ? project.engineId : null);
                    if (id === currentId) return;
                    if (ready) switchEngine(id);
                    else if (activeDir) void startWith(activeDir, id);
                  }}
                  onRequestManageProviders={() => setProvidersDialogOpen(true)}
                />
                {primaryConfigOption && (
                  <ConfigPicker
                    option={primaryConfigOption}
                    value={configValues[primaryConfigOption.id]}
                    childOptions={childConfigOptions}
                    childValues={configValues}
                    onSelect={setConfig}
                    disabled={!ready || busy}
                  />
                )}
              </div>
              {busy ? (
                <Button
                  type="button"
                  size="sm"
                  variant="subtle"
                  className="rounded-full"
                  onClick={cancel}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  className="rounded-full"
                  onClick={submit}
                  disabled={!ready || !draft.trim()}
                >
                  Send
                </Button>
              )}
            </div>
          </div>
        </div>
        </>
        )}
        </main>

        <div
          className={cn(
            "shrink-0 self-start overflow-hidden transition-[width,opacity] duration-200 ease-out",
            contextOpen && view === "chat"
              ? "w-72 opacity-100"
              : "w-0 opacity-0",
          )}
        >
          <div className="w-72">
            <ContextPanel
              projectDir={activeDir ?? ""}
              git={git}
              onRefresh={refreshGit}
              servers={servers}
              onStopServer={stopServer}
              agents={agents}
              projectAgents={activeProjectEntry?.agents ?? []}
              onProjectAgentsChange={(next) => {
                if (activeDir) setProjectAgents(activeDir, next);
              }}
              manualActive={manualActive}
              onToggleManual={(id) =>
                setManualActive((cur) =>
                  cur.includes(id)
                    ? cur.filter((x) => x !== id)
                    : [...cur, id],
                )
              }
            />
          </div>
        </div>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setEditingProject(null);
        }}
        editing={editingProject}
        onPreviewTint={setPreviewTint}
        onCreate={({ dir, ...meta }) => {
          remember(dir, editingProject?.engineId, meta);
          if (!editingProject && dir !== activeDir) void startWith(dir);
        }}
      />

      <ProvidersDialog
        open={providersDialogOpen}
        onOpenChange={setProvidersDialogOpen}
      />
    </div>
  );
}
