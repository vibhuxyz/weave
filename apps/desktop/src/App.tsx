import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SearchIcon,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { JumpToLatestButton } from "@/shared/ui/jump-to-latest-button";
import { usePersistedState } from "@/shared/hooks/usePersistedState";
import { useResizableSidebar } from "@/shared/hooks/useResizableSidebar";
import { useTextareaAutosize } from "@/shared/hooks/useTextareaAutosize";
import { cn } from "@/shared/lib/cn";
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
import { ContextPanel } from "./ContextPanel";
import { Sidebar } from "./Sidebar";
import { CreateProjectDialog, toneColor } from "./CreateProjectDialog";
import { AgentMessage } from "./agent/components/AgentMessage";
import { ThinkingBlock } from "./agent/components/ThinkingBlock";
import { basename } from "./paths";
import { useAcpChat } from "./useAcpChat";
import { useProject } from "./useProject";
import { useProjects } from "./useProjects";
import { useRunningServers } from "./useRunningServers";

export function App() {
  const { state: project, choose, startWith } = useProject();
  const port = project.status === "running" ? project.port : null;
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
    chats,
    activeSessionId,
    send,
    cancel,
    setConfig,
    refreshGit,
    newChat,
    openChat,
  } = useAcpChat(port);

  const { projects, remember } = useProjects();
  const [createOpen, setCreateOpen] = useState(false);
  const [previewTint, setPreviewTint] = useState<string>();
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

  const submit = () => {
    send(draft);
    setDraft("");
    resetComposerHeight();
  };

  // ── No project yet: the whole app is the picker ──────────────────────
  if (project.status !== "running") {
    return (
      <div
        data-app-shell-root="true"
        className="bg-dot-grid flex h-dvh flex-col items-center justify-center gap-4 text-foreground"
      >
        <h1 className="text-lg font-medium">my-berd-app</h1>
        {project.status === "error" ? (
          <p className="max-w-md text-center text-sm text-destructive">
            {project.message}
          </p>
        ) : (
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Choose a project folder. The agent will read and edit files inside it.
          </p>
        )}
        <Button
          type="button"
          onClick={choose}
          disabled={project.status === "loading" || project.status === "starting"}
        >
          {project.status === "starting" ? "Starting agent…" : "Open project"}
        </Button>
      </div>
    );
  }

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
    toneColor(projects.find((p) => p.dir === project.dir)?.tint) ??
    "transparent";

  return (
    <div
      data-app-shell-root="true"
      className="bg-dot-grid flex h-dvh flex-col text-foreground"
      style={{ "--project-tint": projectTint } as CSSProperties}
    >
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
          {basename(project.dir)}
        </span>
        <div className="flex shrink-0 items-center gap-2 text-xs">
          {!ready && <span className="text-muted-foreground">{connection}</span>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-muted-foreground outline-none transition-colors hover:bg-secondary/60 hover:text-foreground">
                {engineName}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Agent Engine</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={(project.status === "running" ? project.engineId : null) || engineId || ""}
                onValueChange={(id) => {
                  const currentId = (project.status === "running" ? project.engineId : null) || engineId;
                  if (id !== currentId) {
                    void startWith(project.dir, id);
                  }
                }}
              >
                {Object.values(ENGINES).map((engine) => (
                  <DropdownMenuRadioItem key={engine.id} value={engine.id}>
                    {engine.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" className={iconBtn} disabled aria-label="Search">
            <SearchIcon className="size-4" />
          </button>
          <button
            type="button"
            className={iconBtn}
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
              activeProjectDir={project.dir}
              onSelectProject={(dir) => {
                const entry = projects.find((p) => p.dir === dir);
                if (dir !== project.dir) void startWith(dir, entry?.engineId);
              }}
              onAddProject={() => setCreateOpen(true)}
              chats={chats}
              activeSessionId={activeSessionId}
              onSelectChat={openChat}
              onNewChat={newChat}
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

        <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-agent-surface-base">
        <div
          ref={scrollRef}
          onScroll={onTranscriptScroll}
          className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 overflow-y-auto p-6"
        >
          {turns.length === 0 && ready && (
            <p className="mt-16 text-center text-sm text-muted-foreground">
              Ask {engineLabel || "the agent"} to fix a bug in this project.
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
                      projectDir={project.dir}
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
                  turn.text
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

        <div className="mx-auto w-full max-w-5xl px-6 pb-6">
          <div className="flex flex-col gap-2.5 rounded-composer bg-surface-chat-composer p-3 [-webkit-backdrop-filter:var(--backdrop-composer-glass)] [backdrop-filter:var(--backdrop-composer-glass)]">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
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
                {configOptions.map((option) => (
                  <ConfigPicker
                    key={option.id}
                    option={option}
                    value={configValues[option.id]}
                    onSelect={setConfig}
                    disabled={!ready || busy}
                  />
                ))}
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
        </main>

        <div
          className={cn(
            "shrink-0 self-start overflow-hidden transition-[width,opacity] duration-200 ease-out",
            contextOpen ? "w-72 opacity-100" : "w-0 opacity-0",
          )}
        >
          <div className="w-72">
            <ContextPanel
              projectDir={project.dir}
              git={git}
              onRefresh={refreshGit}
              servers={servers}
              onStopServer={stopServer}
            />
          </div>
        </div>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onPreviewTint={setPreviewTint}
        onCreate={({ dir, ...meta }) => {
          remember(dir, undefined, meta);
          if (dir !== project.dir) void startWith(dir);
        }}
      />
    </div>
  );
}
