import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ImagePlusIcon,
  PlusIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SearchIcon,
  ActivityIcon,
  XIcon,
} from "lucide-react";
import { Button, ComposerActionButton, ComposerSendButton, ConfirmDialog, GlassButton, ImageLightbox, JumpToLatestButton, DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger, ConfigPicker, Popover, PopoverContent, PopoverTrigger } from "@/shared/ui";
import { DefaultProjectGlyphIcon } from "@/features/projects/ui";
import { ArchiveSettingsView, archiveLoadState } from "@/features/archive";
import type { ChatImageAttachmentDraft } from "@/shared/types/messages";
import {
  usePersistedState,
  useResizablePanel,
  useResizableSidebar,
  useTextareaAutosize,
} from "@/shared/hooks";
import { cn, flattenConfigValues, planExitTarget, splitConfigOptions, type PlanExitIntent } from "@/shared/lib";
import { isAuthRequiredError } from "@weave/protocol";
import { ENGINES, DEFAULT_ENGINE_ID, tokenReportingFor } from "@weave/agent/browser";
import { EnginePicker } from '@/features/engines/components';
import { SettingsView } from '@/features/settings';
import { ChatSkeleton, ContextPanel, EngineSetupPanel, hasSelectableModes, ModePicker, PermissionCard, QuestionCard, UserMessage, type ContextPanelTab } from '@/features/chat/components';
import { parseRunCommand, RunPanel } from '@/features/runs';
import { FileViewer, useFileStore } from '@/features/files';
import { LocalPathOpenerContext } from '@/shared/ui/ai-elements';

/** Inspector width: the spec's 400px to start, dragged from its left edge. */
const INSPECTOR_DEFAULT_WIDTH = 400;
const INSPECTOR_MAX_WIDTH = 720;
const CONTEXT_PANEL_WIDTH = 288;

/**
 * The transcript widens with the window rather than sitting at one cap: a
 * full-screen display was leaving most of the row empty, while an unbounded
 * column would run prose past the width anyone reads comfortably.
 */
const TRANSCRIPT_WIDTH = "mx-auto w-full max-w-4xl xl:max-w-5xl 2xl:max-w-6xl";

/**
 * The composer stays at the narrower cap the transcript used to share. One line
 * of input stretched to the full width of a large display reads as a gap in the
 * page rather than a place to type.
 */
const COMPOSER_WIDTH = "mx-auto w-full max-w-4xl";
import { collectTasks, PlanPanel, planProgressOf, planSignatureOf, TurnDiffPanel, StreamedTurn, StreamStatusLine, TasksPanel } from "@/agent/components";
import type { BlockAction } from "@/agent/normalize";
import { collectTurnDiffs } from "@/agent/diff";
import { Sidebar } from "./Sidebar";
import { CreateProjectDialog, toneColor } from '@/features/projects/components';
import { AgentAvatar, AgentsView, ConversationStart } from '@/features/agents/components';
import { SkillsView } from "@/features/skills/components";
import { formatSkillPluginsSystemPrompt, usePlugins, useSkillPlugins } from '@/features/plugins/hooks';
import { PluginsView } from '@/features/plugins/components';
import {
  activeAgents,
  useAgents,
  formatPersonaSystemPrompt,
  type Agent,
} from '@/features/agents/hooks';
import { EngineAuthPanel } from "@/features/auth";
import { HomeView } from "@/home/canvas/ui";
import { basename } from '@/features/projects/lib';
import { latestPlanEntries, useAcpChat, type ChatImageAttachment } from '@/features/chat/hooks';
import {
  AutoCompactSetting,
  CompactionNoticeRow,
  ContextUsageButton,
  HistoryGapRow,
  mergeDraftImages,
  mergeDraftText,
} from '@/features/chat/compaction';
import { useChatWorkspace, useProject, useProjectHomePins, useProjects, type ProjectEntry } from '@/features/projects/hooks';
import { useNewChatInProject, useRunInProject } from "./use-new-chat-in-project";
import { useRunningServers } from '@/features/engines/hooks';
import { useHarnesses } from '@/features/settings/hooks';
import { UsageLimitIsland, useQuotaStore } from "@/features/quota";
import { StartupSplash, useStartupSplash } from "@/features/startup";

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

const NO_PROJECT_LABEL = "No project";
const NEW_CHAT_TITLE = "New chat";

export function App() {
  const [previousView, setPreviousView] = useState<"home" | "chat" | "agents" | "plugins" | "skills">("home");
  const { state: project, choose, startWith } = useProject();
  const server = project.status === "running" ? project.server : null;
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
    pluginCatalog,
    chats,
    archive: chatArchive,
    activeSessionId,
    permissionRequest,
    answerPermission,
    question,
    answerQuestion,
    modes,
    setMode,
    engineSetup,
    startEngineSetup,
    cancelEngineSetup,
    sendSetupKey,
    submitSetupConsent,
    isOpeningChat,
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
    pendingConfigValue,
    refreshGit,
    refreshEngines,
    refreshPlugins,
    newChat,
    openChat,
    updateTurnPlan,
    startRun,
    cancelRun,
    openFile,
  } = useAcpChat(server, { onProjectDeleted: (dir) => forget(dir) });

  const { enrichedEngines } = useHarnesses({ engines, onRefreshEngines: refreshEngines });
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const tasks = useMemo(() => (isTasksOpen ? collectTasks(turns) : null), [isTasksOpen, turns]);
  const openTasks = useCallback(() => setIsTasksOpen(true), []);
  const otherEngineChoices = useMemo(
    () => enrichedEngines.filter((e) => e.installed && e.id !== engineId).map((e) => ({ id: e.id, label: e.label })),
    [enrichedEngines, engineId],
  );
  const startupSplash = useStartupSplash({
    project,
    connection,
    hasAuthPrompt: authRequired !== null,
    hasError: error !== null,
  });

  const { projects, remember, forget, setProjectAgents, setProjectPlugins, archive, unarchive } =
    useProjects();
  const { pinnedDirs: homeProjectDirs, togglePin: toggleProjectHome } = useProjectHomePins();
  const [archivingProject, setArchivingProject] = useState<ProjectEntry | null>(null);
  const { agents } = useAgents();
  const chatWorkspace = useChatWorkspace();
  const chatWorkspaceDir = chatWorkspace.status === "ready" ? chatWorkspace.dir : null;
  const isChatWorkspaceActive = activeDir !== undefined && activeDir === chatWorkspaceDir;
  const { plugins: skillPlugins } = useSkillPlugins();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<
    ProjectEntry | null
  >(null);
  const [previewTint, setPreviewTint] = useState<string>();
  // Manual agents the user turned on for the next new chat.
  const [manualActive, setManualActive] = useState<string[]>([]);
  // Manual plugins the user turned on for the next new chat.
  const [manualPluginActive, setManualPluginActive] = useState<string[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const activeProjectEntry =
    project.status === "running"
      ? projects.find((p) => p.dir === project.dir)
      : undefined;
  const [view, setView] = usePersistedState<
    "home" | "chat" | "agents" | "plugins" | "skills" | "settings"
  >(
    "berd:view",
    "home",
    (v, d) =>
      v === "home" || v === "agents" || v === "plugins" || v === "skills" || v === "settings" ? v : d,
  );

  const openSettings = useCallback(() => {
    if (view !== "settings") {
      setPreviousView(view);
    }
    setView("settings");
  }, [view, setView]);

  const closeSettings = useCallback(() => {
    setView(previousView || "home");
  }, [previousView, setView]);

  const activePlugins = usePlugins(
    pluginCatalog,
    activeProjectEntry?.plugins ?? [],
    manualPluginActive,
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
    setSelectedAgentId(null);
  }, [project, choose, newChat, setView]);
  const openProject = useCallback(
    (dir: string, engineId?: string) => {
      setView("chat");
      if (dir === activeDir && engineId === undefined) return;
      const entry = projects.find((p) => p.dir === dir);
      void startWith(dir, engineId ?? entry?.engineId);
    },
    [activeDir, projects, startWith, setView],
  );
  const newChatInProject = useNewChatInProject({
    activeDir,
    connection,
    startNewChat,
    openProject,
  });
  const startChatWithoutProject = useCallback(() => {
    if (!chatWorkspaceDir) {
      startNewChat();
      return;
    }
    newChatInProject(chatWorkspaceDir);
  }, [chatWorkspaceDir, newChatInProject, startNewChat]);
  const confirmArchiveProject = useCallback(
    (entry: ProjectEntry) => {
      archive(entry.dir, new Date());
      if (entry.dir !== activeDir) return;
      const next = projects.find((p) => p.dir !== entry.dir && !p.archivedAt);
      if (next) void startWith(next.dir, next.engineId);
    },
    [archive, activeDir, projects, startWith],
  );
  const openChatAndShow = useCallback(
    (sessionId: string) => {
      setView("chat");
      // Already the active chat — loaded, still arriving, or a new chat with nothing sent yet.
      const isUnsavedDraft = !chats.some((chat) => chat.id === sessionId);
      if (sessionId === activeSessionId && (turns.length > 0 || isOpeningChat || isUnsavedDraft)) return;
      openChat(sessionId);
    },
    [openChat, setView, activeSessionId, turns.length, isOpeningChat, chats],
  );
  const runInProject = useRunInProject({ activeDir, connection, openProject });
  const openChatInProject = useCallback(
    (sessionId: string, projectDir: string) => runInProject(projectDir, () => openChatAndShow(sessionId)),
    [runInProject, openChatAndShow],
  );

  // Every project dir Weave knows about, so a container started for one of
  // them still shows up (and stays stoppable) from any other session.
  const knownDirs = useMemo(() => {
    const dirs = projects.map((p) => p.dir).filter((dir) => dir !== chatWorkspaceDir);
    return chatWorkspaceDir ? [...dirs, chatWorkspaceDir] : dirs;
  }, [projects, chatWorkspaceDir]);
  const pickerProjects = useMemo(
    () => projects.filter((p) => p.dir !== chatWorkspaceDir && (!p.archivedAt || p.dir === activeDir)),
    [projects, chatWorkspaceDir, activeDir],
  );
  const selectedAgent = useMemo(
    () => (selectedAgentId ? agents.find((agent) => agent.id === selectedAgentId) ?? null : null),
    [agents, selectedAgentId],
  );
  const activeChatTitle = chats.find((chat) => chat.id === activeSessionId)?.title || null;
  const isDraftChat = activeSessionId !== null && activeSessionId !== "" && activeChatTitle === null && !chats.some((chat) => chat.id === activeSessionId);
  const projectTitle = isChatWorkspaceActive || !activeDir ? "Weave" : basename(activeDir);
  const topBarTitle = view === "chat" ? activeChatTitle ?? (isDraftChat ? NEW_CHAT_TITLE : projectTitle) : projectTitle;
  const archiveProjects = useMemo(
    () => {
      const saved = projects
        .filter((p) => p.dir !== chatWorkspaceDir)
        .map((p) => ({ dir: p.dir, name: p.name || basename(p.dir), tint: p.tint, archivedAt: p.archivedAt }));
      return chatWorkspaceDir ? [...saved, { dir: chatWorkspaceDir, name: NO_PROJECT_LABEL }] : saved;
    },
    [projects, chatWorkspaceDir],
  );
  const { chatsByProject, archivedChatsByProject, requestProjectChats } = chatArchive;
  const chatCountByProject = useMemo(
    () =>
      Object.fromEntries(
        knownDirs.map((dir) => [dir, (chatsByProject[dir]?.length ?? 0) + (archivedChatsByProject[dir]?.length ?? 0)]),
      ),
    [knownDirs, chatsByProject, archivedChatsByProject],
  );
  useEffect(() => {
    if (connection === "ready") requestProjectChats(knownDirs);
  }, [connection, knownDirs, requestProjectChats]);
  const { servers, stop: stopServer } = useRunningServers(
    turns,
    project.status === "running" ? project.dir : undefined,
    knownDirs,
  );

  // Keep the running project at the top of the sidebar list, under the engine
  // that actually opened the session — the server falls back to another when
  // the requested one is not installed, and remembering the request would ask
  // for the missing engine again on every reopen.
  useEffect(() => {
    if (project.status !== "running" || chatWorkspace.status === "loading") return;
    if (project.dir === chatWorkspaceDir) return;
    remember(project.dir, engineId ?? project.engineId);
  }, [project, engineId, remember, chatWorkspace.status, chatWorkspaceDir]);

  // A model a chosen agent asked for, applied once its config options arrive.
  const pendingAgentModel = useRef<string | null>(null);

  const activeEngineId =
    engineId || (project.status === "running" ? project.engineId : null);

  const isSameEngine = useCallback((a?: string | null, b?: string | null) => {
    if (!a || !b) return true;
    if (a === b) return true;
    return (
      (a === "agy" || a === "antigravity") &&
      (b === "agy" || b === "antigravity")
    );
  }, []);

  const handleSelectEngine = useCallback(
    (id: string) => {
      const currentId =
        engineId || (project.status === "running" ? project.engineId : null);
      if (id === currentId && !authRequired) return;
      clearAuth();
      void invoke("save_engine_id", { engineId: id }).catch(console.error);
      if (activeDir && activeDir !== chatWorkspaceDir) remember(activeDir, id);
      if (connection === "ready") switchEngine(id);
      else if (activeDir) void startWith(activeDir, id);
    },
    [engineId, project, authRequired, clearAuth, activeDir, remember, connection, switchEngine, startWith],
  );



  const handleChatWithAgent = useCallback(
    (agent: Agent) => {
      if (!chatWorkspaceDir) {
        void choose();
        return;
      }
      pendingAgentModel.current = agent.model ?? null;
      const needsEngine = agent.engineId !== undefined && !isSameEngine(agent.engineId, activeEngineId);
      newChatInProject(chatWorkspaceDir, {
        engineId: needsEngine ? agent.engineId : undefined,
        afterStart: () => {
          setSelectedAgentId(agent.id);
          setManualActive([agent.id]);
        },
      });
    },
    [chatWorkspaceDir, choose, isSameEngine, activeEngineId, newChatInProject],
  );

  /**
   * The mode is shown once. An agent may advertise it twice — agy sends both
   * native session modes and a `mode` config option for the same `--mode` —
   * and two pills for one setting is how the composer ended up showing a
   * chosen mode beside a stale one.
   */
  const showsNativeModes = hasSelectableModes(modes);

  /** What this agent advertises, sorted into the composer's three slots. */
  const {
    model: modelOption,
    primary: primaryConfigOption,
    children: childConfigOptions,
  } = useMemo(
    () => splitConfigOptions(configOptions, { hasNativeModes: showsNativeModes }),
    [configOptions, showsNativeModes],
  );

  /**
   * Drop the engine out of "plan" mode — run on plan approval so the follow-up
   * prompt actually executes instead of the engine re-entering ExitPlanMode.
   */
  const EFFORT_KEYS = useMemo(
    () => ["effort", "reasoningEffort", "model_reasoning_effort", "reasoning_effort"],
    [],
  );
  const effortOption = useMemo(() => {
    return configOptions.find(
      (o) =>
        EFFORT_KEYS.includes(o.id) ||
        o.category === "effort" ||
        o.category === "reasoning" ||
        o.id.toLowerCase().includes("effort") ||
        o.id.toLowerCase().includes("reasoning"),
    );
  }, [configOptions, EFFORT_KEYS]);

  const [localReasoningEffort, setLocalReasoningEffort] = useState("medium");
  const activeEffortValue = effortOption
    ? configValues[effortOption.id] || localReasoningEffort
    : localReasoningEffort;

  const handleSelectEffort = useCallback(
    (val: string) => {
      setLocalReasoningEffort(val);
      if (effortOption) {
        const flattened = flattenConfigValues(effortOption);
        const matched = flattened.find(
          (v) =>
            v.value.toLowerCase() === val.toLowerCase() ||
            v.name.toLowerCase() === val.toLowerCase() ||
            v.value.toLowerCase().includes(val.toLowerCase()),
        );
        if (matched) {
          setConfig(effortOption.id, matched.value);
        }
      }
    },
    [effortOption, setConfig],
  );

  const [projectPickerOpen, setProjectPickerOpen] = useState(false);


  const exitPlanMode = useCallback(
    (intent: PlanExitIntent = "accept-edits") => {
      // Native modes first: with them advertised the config pill is hidden, and
      // for agy `session/set_mode` is what writes through to its `--mode`.
      if (hasSelectableModes(modes)) {
        if (modes.currentModeId !== "plan") return;
        const target = planExitTarget(
          modes.availableModes.map((mode) => mode.id),
          intent,
        );
        if (target) setMode(target);
        return;
      }
      if (!primaryConfigOption) return;
      if (configValues[primaryConfigOption.id] !== "plan") return;
      const target = planExitTarget(
        flattenConfigValues(primaryConfigOption).map((value) => value.value),
        intent,
      );
      if (target) setConfig(primaryConfigOption.id, target);
    },
    [modes, setMode, primaryConfigOption, configValues, setConfig],
  );

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
  const [imageAttachments, setImageAttachments] = useState<ChatImageAttachmentDraft[]>([]);
  // Everything uploaded this session, so `/img` can re-attach an earlier image
  // without the user hunting for the file again.
  const [imageLibrary, setImageLibrary] = useState<ChatImageAttachmentDraft[]>([]);
  const [imgQuery, setImgQuery] = useState<string | null>(null);
  // The attachment whose instruction box should grab focus next — set when an
  // image lands via `/img` so the user can type what to do with it right away.
  const [focusAttachmentId, setFocusAttachmentId] = useState<string | null>(null);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<
    { previewUrl: string; name?: string } | null
  >(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
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
  /**
   * The turn whose file changes the side panel is reading, set by "Open diff"
   * on an assistant card. `null` leaves the panel on the context tabs.
   */
  const [diffTurnId, setDiffTurnId] = useState<string | null>(null);
  /** A single file the chat asked the inspector to open. */
  const [diffFocusPath, setDiffFocusPath] = useState<string | undefined>();
  const [contextTab, setContextTab] = useState<ContextPanelTab>("Context");

  // Turns that touched files, for the side-panel diff reader.
  const turnDiffEntries = useMemo(() => collectTurnDiffs(turns), [turns]);
  const diffPanelOpen =
    view === "chat" &&
    diffTurnId !== null &&
    turnDiffEntries.some((entry) => entry.turnId === diffTurnId);
  const openFilePath = useFileStore((state) => state.openPath);
  const isFileExpanded = useFileStore((state) => state.isExpanded);
  const filePanelOpen = view === "chat" && openFilePath !== null;
  const planEntries = useMemo(() => latestPlanEntries(turns), [turns]);
  const planSignature = planSignatureOf(planEntries);
  const planProgress = planProgressOf(planEntries);
  const [closedPlanSignature, setClosedPlanSignature] = useState<string | null>(null);
  const [isPlanExpanded, setIsPlanExpanded] = useState(false);
  const planPanelOpen = view === "chat" && !filePanelOpen && planEntries.length > 0 && closedPlanSignature !== planSignature;
  const openPlan = useCallback(() => setClosedPlanSignature(null), []);
  const sidePanelOpen = view === "chat" && (contextOpen || diffPanelOpen || filePanelOpen || planPanelOpen);

  // A different chat has its own turns — drop the diff the panel was reading.
  useEffect(() => {
    setDiffTurnId(null);
  }, [activeSessionId]);
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
  const inspectorResize = useResizablePanel({
    storageKey: "berd:inspector:width",
    defaultWidth: INSPECTOR_DEFAULT_WIDTH,
    minWidth: 320,
    maxWidth: INSPECTOR_MAX_WIDTH,
    edge: "left",
  });

  const fileWidth = isFileExpanded ? INSPECTOR_MAX_WIDTH : inspectorResize.width;
  const planWidth = isPlanExpanded ? INSPECTOR_MAX_WIDTH : inspectorResize.width;
  const inspectorWidth = filePanelOpen ? fileWidth : planPanelOpen ? planWidth : diffPanelOpen ? inspectorResize.width : CONTEXT_PANEL_WIDTH;

  const onTranscriptScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = bottom;
    setAtBottom(bottom);
  }, []);

  // `scrollIntoView` walks every scrollable ancestor to bring the target into
  // view — including `<main>`, which is `overflow-hidden` and therefore still
  // a valid (if invisible) scroll container. If its content is ever even a
  // fraction taller than its box, that walk scrolls `<main>` itself, shifting
  // the whole transcript+composer column up and exposing blank space below
  // the composer. Scrolling the known transcript container directly avoids
  // that ancestor walk entirely.
  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  const [installingEngineId, setInstallingEngineId] = useState<string | null>(null);

  const handleInstallEngine = async (packageName: string, targetEngineId?: string) => {
    setInstallingEngine(true);
    setInstallingEngineId(targetEngineId || null);
    try {
      await invoke("install_engine", { packageName });
      refreshEngines();
      const currentTarget = targetEngineId || (project.status === "running" ? project.engineId : engineId);
      if ("dir" in project) {
        void startWith(project.dir, currentTarget || DEFAULT_ENGINE_ID);
      }
    } catch (e) {
      console.error(e);
      alert(`Failed to install: ${String(e)}`);
      throw e;
    } finally {
      setInstallingEngine(false);
      setInstallingEngineId(null);
    }
  };

  const handleUninstallEngine = async (packageName: string, targetEngineId?: string) => {
    setInstallingEngine(true);
    setInstallingEngineId(targetEngineId || null);
    try {
      await invoke("uninstall_engine", { packageName });
      refreshEngines();
    } catch (e) {
      console.error(e);
      alert(`Failed to uninstall: ${String(e)}`);
      throw e;
    } finally {
      setInstallingEngine(false);
      setInstallingEngineId(null);
    }
  };

  useEffect(() => {
    // Only follow the stream if the user is already at the live edge —
    // otherwise scrolling up to read is fought by every new chunk. Scrolls
    // the transcript container directly for the same reason as
    // `jumpToLatest` above — `scrollIntoView` would also drag `<main>`.
    if (atBottomRef.current) {
      const el = scrollRef.current;
      el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [turns]);

  // @-mentioned agents applied to the *next* message only.
  const [mentioned, setMentioned] = useState<Agent[]>([]);
  const chipAgent = selectedAgent && !mentioned.some((agent) => agent.id === selectedAgent.id) ? selectedAgent : null;
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const mentionItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // A query with a "/" or "." is a path — `@src/App.tsx` — so the menu shows
  // files instead of agents.
  const fileMode = mentionQuery !== null && /[./]/.test(mentionQuery);
  const mentionMatches =
    mentionQuery === null || fileMode
      ? []
      : agents.filter(
          (a) =>
            !mentioned.some((m) => m.id === a.id) &&
            a.name.toLowerCase().includes(mentionQuery.toLowerCase()),
        );

  const imgMatches =
    imgQuery === null
      ? []
      : imageLibrary.filter((image) =>
          image.name.toLowerCase().includes(imgQuery.trim().toLowerCase()),
        );

  useEffect(() => {
    if (mentionMatches.length > 0 && mentionItemRefs.current[mentionIndex]) {
      mentionItemRefs.current[mentionIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [mentionIndex, mentionMatches.length]);

  useEffect(() => {
    if (fileMode && mentionQuery !== null) requestFiles(mentionQuery);
    else clearFileMatches();
  }, [fileMode, mentionQuery, requestFiles, clearFileMatches]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const head = value.slice(0, caret);
    const m = /(?:^|\s)@([\w./-]*)$/.exec(head);
    setMentionQuery(m ? (m[1] ?? "") : null);
    const img = /(?:^|\s)\/img[ ]?([\w. -]*)$/.exec(head);
    setImgQuery(img ? (img[1] ?? "") : null);
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

  /**
   * Send an edited copy of an earlier prompt, attachments included.
   *
   * The images come back as the data URIs the transcript is already showing,
   * so a re-send carries the same screenshots rather than silently dropping
   * them — the engine needs the bytes again, not the path it wrote.
   */
  const resendPrompt = (text: string, images: ChatImageAttachment[]) => {
    send(text, {
      images: images
        .filter((image) => image.previewUrl.startsWith("data:"))
        .map((image, i) => ({
          id: `resend-${i}`,
          kind: "image" as const,
          name: image.path?.split("/").pop() ?? `image-${i + 1}`,
          path: image.path,
          mimeType: image.mimeType || "image/png",
          base64: image.previewUrl.slice(image.previewUrl.indexOf(",") + 1),
          previewUrl: image.previewUrl,
          prompt: image.prompt,
        })),
    });
  };

  const pickMention = (agent: Agent) => {
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft
      .slice(0, caret)
      .replace(/(?:^|\s)@([\w./-]*)$/, (full) => full.replace(/@[\w./-]*$/, ""));
    setDraft(before + draft.slice(caret));
    setMentioned((cur) => (cur.some((m) => m.id === agent.id) ? cur : [...cur, agent]));
    setSelectedAgentId(agent.id);
    setManualActive((cur) => (cur.includes(agent.id) ? cur : [...cur, agent.id]));
    if (agent.model) {
      pendingAgentModel.current = agent.model;
    }
    const currentEngine = project.status === "running" ? project.engineId : engineId;
    if (agent.engineId && agent.engineId !== currentEngine) {
      if (connection === "ready") switchEngine(agent.engineId);
      else if (activeDir) void startWith(activeDir, agent.engineId);
    }
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

  const addImageFiles = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const image: ChatImageAttachmentDraft = {
        id: crypto.randomUUID(),
        kind: "image",
        name: file.name,
        mimeType: file.type,
        base64,
        previewUrl: URL.createObjectURL(file),
        prompt: "",
      };
      // Guard against a doubled event (drop bubbling, paste + drop) adding the
      // identical file twice in the same tick.
      const isDup = (a: ChatImageAttachmentDraft) =>
        a.name === image.name && a.base64 === image.base64;
      setImageAttachments((cur) => (cur.some(isDup) ? cur : [...cur, image]));
      setImageLibrary((cur) => (cur.some(isDup) ? cur : [...cur, image]));
    }
  };

  // The library holds the only reference to a preview URL once a message is
  // sent, so removing a draft attachment must not revoke it.
  const removeImageAttachment = (id: string) => {
    setImageAttachments((cur) => cur.filter((a) => a.id !== id));
  };

  const attachFromLibrary = (image: ChatImageAttachmentDraft) => {
    // Picking from `/img` always puts the image on the message. If it's
    // already attached, refresh that copy's instructions from the library
    // (the saved prompt) rather than adding a duplicate.
    const existing = imageAttachments.find((a) => a.previewUrl === image.previewUrl);
    if (existing) {
      setImageAttachments((cur) =>
        cur.map((a) =>
          a.id === existing.id
            ? { ...a, prompt: a.prompt.trim() || image.prompt }
            : a,
        ),
      );
      setFocusAttachmentId(existing.id);
    } else {
      const id = crypto.randomUUID();
      setImageAttachments((cur) => [
        ...cur,
        { ...image, id, prompt: image.prompt },
      ]);
      setFocusAttachmentId(id);
    }
    const el = textareaRef.current;
    const caret = el?.selectionStart ?? draft.length;
    const before = draft.slice(0, caret).replace(/(?:^|\s)\/img[ ]?[\w. -]*$/, "");
    const next = before + draft.slice(caret);
    setDraft(next);
    setImgQuery(null);
    // Focus goes to the new image's instruction box (see focusAttachmentId),
    // so the caret position in the textarea is all we restore here.
    requestAnimationFrame(() => el?.setSelectionRange(before.length, before.length));
  };

  const setImageAttachmentPrompt = (id: string, prompt: string) => {
    setImageAttachments((cur) => cur.map((a) => (a.id === id ? { ...a, prompt } : a)));
    // Keep it on the image itself too, so re-attaching via `/img` brings the
    // instructions back with it instead of an empty box.
    const previewUrl = imageAttachments.find((a) => a.id === id)?.previewUrl;
    setImageLibrary((cur) =>
      cur.map((a) => (a.previewUrl === previewUrl ? { ...a, prompt } : a)),
    );
  };

  const handleBlockAction = (action: BlockAction) => {
    switch (action.type) {
      case "send_message":
        send(action.text);
        return;
      case "cancel_run":
        cancel();
        return;
      case "continue_with_engine":
        handleSelectEngine(action.engineId);
        return;
    }
  };

  const submit = () => {
    // A turn is already in flight — the button shows Stop, and Enter must
    // agree with it. Without this guard an impatient second Enter appends a
    // duplicate bubble and queues a second prompt behind a stuck one.
    if (busy || !ready) return;
    if (!draft.trim() && imageAttachments.length === 0) return;
    const runRequest = parseRunCommand(draft);
    if (runRequest !== null) {
      startRun(runRequest);
      setDraft("");
      resetComposerHeight();
      return;
    }
    // Standing agents (`always` + manually toggled) plus this message's
    // @-mentions ride every prompt, so the persona can't drift over a chat.
    // The server merges this with the skills catalog into one <system> block.
    const extraIds = [...manualActive, ...mentioned.map((a) => a.id)];
    const persona = formatPersonaSystemPrompt(
      activeProjectEntry?.agents,
      agents,
      extraIds,
    );
    // The same set, as identity rather than instructions: the run card names
    // who answered, so a standing agent is visible without opening settings.
    const personas = activeAgents(activeProjectEntry?.agents, agents, extraIds).map(
      (a) => ({ id: a.id, name: a.name, icon: a.icon, character: a.character }),
    );
    const plugins = formatSkillPluginsSystemPrompt(skillPlugins, activeDir);

    let textToSend = draft;
    const trimmedDraft = draft.trim();
    const isPlanSlash = trimmedDraft.startsWith("/plan ") || trimmedDraft === "/plan";
    const isNaturalPlan =
      /^(?:create|make|propose|generate|write|draft)(?:\s+(?:a|an|one))?\s+plan\b/i.test(trimmedDraft) ||
      /^plan\s*:\s*/i.test(trimmedDraft);

    if (isPlanSlash || isNaturalPlan) {
      const task = isPlanSlash
        ? trimmedDraft.slice(5).trim()
        : trimmedDraft
            .replace(/^(?:create|make|propose|generate|write|draft)(?:\s+(?:a|an|one))?\s+plan\s*(?:to|for|on|about|how to)?\s*/i, "")
            .replace(/^plan\s*:\s*/i, "")
            .trim();
      textToSend = task
        ? `[Planning Mode]\nPlease inspect the workspace and propose a step-by-step execution plan for the following task, formatted inside a <plan> block with numbered steps. DO NOT modify any files or execute commands yet until I review and approve the plan:\n\n${task}`
        : `[Planning Mode]\nPlease inspect the current status and propose a step-by-step execution plan inside a <plan> block with numbered steps before modifying any files or running commands.`;
    }

    const withdrawnDraft = draft;
    const withdrawnImages = imageAttachments;
    send(textToSend, {
      persona: [persona, plugins].filter(Boolean).join("\n\n") || undefined,
      mentions: mentioned.map((a) => a.name),
      personas,
      images: imageAttachments,
      plugins: activePlugins.activeRefs,
      onWithdrawn: () => {
        setDraft((current) => mergeDraftText(current, withdrawnDraft));
        setImageAttachments((current) => mergeDraftImages(current, withdrawnImages));
      },
    });
    setImageAttachments([]);
    setDraft("");
    setMentioned([]);
    setMentionQuery(null);
    setImgQuery(null);
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

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    // Only drag on primary (left) button
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    // Don't drag if clicking buttons, inputs, links or other interactive elements
    if (target?.closest("button, a, input, select, textarea, [role='button'], [data-no-drag]")) {
      return;
    }
    // Double-click toggles maximize/restore on macOS
    if (e.detail === 2) {
      void getCurrentWindow().toggleMaximize();
      return;
    }
    void getCurrentWindow().startDragging();
  };

  return (
    <div
      data-app-shell-root="true"
      className="bg-dot-grid flex h-full min-h-0 flex-col text-foreground"
      style={{ "--project-tint": projectTint } as CSSProperties}
    >
      <UsageLimitIsland />
      {/* ── Top bar: window drag surface + shell chrome ───────────────── */}
      <header
        data-tauri-drag-region="deep"
        onMouseDown={handleHeaderMouseDown}
        className="flex h-[var(--spacing-app-top-bar)] shrink-0 select-none items-center gap-2 pr-4 cursor-default"
      >
        <div data-tauri-drag-region className="h-full w-[var(--spacing-app-top-bar-leading)] shrink-0" />
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
        <span
          data-tauri-drag-region
          className="min-w-0 flex-1 truncate text-[length:var(--text-app-top-bar-title)] text-foreground"
        >
          {topBarTitle}
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
            onClick={() => {
              // While a diff is up, the toggle puts the panel back on context
              // rather than leaving the reader stuck open.
              if (filePanelOpen) {
                useFileStore.getState().close();
                return;
              }
              if (planPanelOpen) {
                setClosedPlanSignature(planSignature);
                return;
              }
              if (diffPanelOpen) {
                setDiffTurnId(null);
                setContextOpen(true);
                return;
              }
              setContextOpen((v) => !v);
            }}
            aria-label={
              sidePanelOpen ? "Hide context panel" : "Show context panel"
            }
          >
            <PanelRightIcon className="size-4" />
          </button>
        </div>
      </header>

      {/* ── Body: three floating panels over the dot grid ─────────────── */}
      <div className="flex min-h-0 flex-1 gap-[var(--spacing-app-panel-gutter-inline)] px-[var(--spacing-app-panel-gutter-inline)] pt-[var(--spacing-app-panel-gutter-bottom)] pb-[var(--spacing-app-panel-gutter-bottom)]">
        {view === "settings" ? (
          <div className="relative flex min-h-0 flex-1 overflow-hidden rounded-[14px] border border-sidebar-shell-border bg-[#121214] shadow-[var(--sidebar-shell-shadow)] backdrop-blur-xl">
            <SettingsView
              engines={enrichedEngines}
              onRefreshEngines={refreshEngines}
              onBack={closeSettings}
              behaviorSettings={<AutoCompactSetting />}
              archiveSettings={
                <ArchiveSettingsView
                  projects={archiveProjects}
                  activeDir={activeDir}
                  chatCountByProject={chatCountByProject}
                  archivedChatsByProject={archivedChatsByProject}
                  autoArchiveAfterDays={chatArchive.autoArchiveAfterDays}
                  chatsLoadState={archiveLoadState(server !== null, chatArchive.isChatListLoaded)}
                  settingsLoadState={archiveLoadState(server !== null, chatArchive.isArchiveSettingsLoaded)}
                  onSetAutoArchive={chatArchive.setAutoArchive}
                  onRestoreProject={unarchive}
                  onDeleteProject={chatArchive.deleteProject}
                  onRestoreChat={chatArchive.restoreChat}
                  onDeleteChat={chatArchive.deleteChat}
                />
              }
              onSignInWithEngine={(id) => {
                closeSettings();
                handleSelectEngine(id);
              }}
            />
          </div>
        ) : (
          <>
        <div
          className={cn(
            "relative h-fit max-h-full self-start shrink-0",
            sidebarResize.resizing
              ? "transition-none"
              : "transition-[width] duration-200 ease-out",
          )}
          style={{ width: sidebarOpen ? sidebarResize.width : 0 }}
        >
          <div
            className="h-fit max-h-full overflow-hidden transition-opacity duration-200"
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
              onArchiveProject={setArchivingProject}
              onNewChatInProject={newChatInProject}
              homeProjectDirs={homeProjectDirs}
              onToggleProjectHome={toggleProjectHome}
              chats={chats}
              chatsByProject={chatsByProject}
              activeSessionId={activeSessionId}
              onSelectChat={openChatInProject}
              chatWorkspaceDir={chatWorkspaceDir}
              draftSessionId={isDraftChat ? activeSessionId : null}
              onArchiveChat={(chat, projectDir) => chatArchive.archiveChat(chat.id, projectDir)}
              busySessionId={busy || isCompacting ? activeSessionId : null}
              onNewChat={startChatWithoutProject}
              onOpenSettings={openSettings}
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
        <main
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          onDragOver={(e) => {
            if (view !== "chat" || !e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            setIsDraggingImage(true);
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setIsDraggingImage(false);
          }}
          onDrop={(e) => {
            if (view !== "chat") return;
            e.preventDefault();
            setIsDraggingImage(false);
            if (e.dataTransfer.files.length) void addImageFiles(e.dataTransfer.files);
          }}
        >
          {view === "chat" && isDraggingImage && (
            <div className="pointer-events-none absolute inset-3 z-40 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary bg-background/70 [backdrop-filter:blur(2px)]">
              <ImagePlusIcon className="size-7 text-primary" />
              <p className="text-sm font-medium text-foreground">Drop image to attach</p>
              <p className="text-xs text-muted-foreground">
                It’s added to the composer as a preview you can annotate
              </p>
            </div>
          )}
          {authRequired && (
            <div className="z-30 w-full shrink-0 px-6 py-4">
              <div className="mx-auto max-w-2xl">
                <EngineAuthPanel
                  engineId={authRequired.engineId}
                  engineLabel={authRequired.engineLabel}
                  message={authRequired.message}
                  methods={authRequired.methods}
                  operation={
                    authOperation && isSameEngine(authOperation.engineId, authRequired.engineId)
                      ? authOperation
                      : null
                  }
                  onStart={(methodId, secret) => startAuth(authRequired.engineId, methodId, secret)}
                  onSubmitInput={submitAuthInput}
                  onCancel={cancelAuth}
                  onDismiss={clearAuth}
                />
              </div>
            </div>
          )}

          {error && !isAuthRequiredError(error) && !authRequired && (() => {
            const missingEngineName = error.match(/is not installed \((.*?)\)/)?.[1];
            return (
              <div className="z-30 w-full shrink-0 border-b border-destructive/20 bg-destructive/10 px-6 py-2.5">
                <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 text-sm text-destructive">
                  <p className="whitespace-pre-wrap">{error.split("\n")[0]}</p>
                  {missingEngineName && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 bg-background/50 hover:bg-background/80"
                      onClick={() => handleInstallEngine(missingEngineName)}
                      disabled={installingEngine}
                    >
                      {installingEngine ? "Installing…" : "Install"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        {view === "agents" ? (
          <AgentsView
            onChat={(agent, message) => {
              handleChatWithAgent(agent);
              if (message) setDraft(message);
            }}
            engines={enrichedEngines}
          />
        ) : view === "plugins" ? (
          <PluginsView
            catalog={pluginCatalog}
            projectPlugins={activeProjectEntry?.plugins ?? []}
            onProjectPluginsChange={(next) => {
              if (activeDir) setProjectPlugins(activeDir, next);
            }}
            onRefresh={refreshPlugins}
            engineId={engineId ?? undefined}
            engineLabel={engineLabel ?? undefined}
            hasProject={!!activeDir}
          />
        ) : view === "skills" ? (
          <SkillsView
            projectDir={activeDir}
            projectLabel={activeDir ? basename(activeDir) : undefined}
          />
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
            onOpenProject={openProject}
          />
        ) : (
        <LocalPathOpenerContext.Provider value={openFile}>
        <div
          ref={scrollRef}
          onScroll={onTranscriptScroll}
          className={cn(
            TRANSCRIPT_WIDTH,
            "flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[var(--spacing-app-panel-gutter-inline)] pt-6 pb-24",
          )}
        >
          {isOpeningChat && <ChatSkeleton />}
          {!isOpeningChat && turns.length === 0 && ready && <ConversationStart agent={selectedAgent} />}
          {!isOpeningChat && turns.map((turn) =>
            turn.role === "notice" ? (
              turn.compaction ? (
                <CompactionNoticeRow key={turn.id} notice={turn.compaction} />
              ) : turn.historyGap ? (
                <HistoryGapRow key={turn.id} count={turn.historyGap} />
              ) : null
            ) : turn.role === "user" ? (
              <UserMessage
                key={turn.id}
                text={turn.text}
                createdAt={turn.createdAt}
                mentions={turn.mentions}
                images={turn.images}
                onEdit={editPrompt}
                onResend={resendPrompt}
                onViewImage={setLightboxImage}
              />
            ) : (
            // The run card owns the column: full width, like the user
            // request above it — not a content-width chat bubble.
            <StreamedTurn
              key={turn.id}
              turn={turn}
              projectDir={activeDir ?? null}
              git={git}
              configValues={configValues}
              engineId={engineId ?? ""}
              engineLabel={engineLabel ?? ""}
              isRunning={busy && turn === turns.at(-1)}
              isLatestTurn={turn === turns.at(-1)}
              otherEngines={otherEngineChoices}
              diffOpen={diffTurnId === turn.id}
              onAction={handleBlockAction}
              onSend={send}
              onUpdatePlan={updateTurnPlan}
              onExitPlanMode={exitPlanMode}
              onOpenTasks={openTasks}
              planProgress={planProgress}
              onOpenPlan={openPlan}
              onOpenDiff={(path) => {
                setDiffFocusPath(path);
                setDiffTurnId((cur) => (cur === turn.id && !path ? null : turn.id));
              }}
            />
            ),
          )}

          {engineSetup && (
            <EngineSetupPanel
              setup={engineSetup}
              onStart={startEngineSetup}
              onCancel={cancelEngineSetup}
              onKey={sendSetupKey}
              onSubmitConsent={submitSetupConsent}
            />
          )}

          {permissionRequest && (
            <PermissionCard
              request={permissionRequest}
              onAnswer={answerPermission}
            />
          )}

          {question && (
            <QuestionCard
              key={question.request.requestId}
              state={question}
              onAnswer={answerQuestion}
            />
          )}

          <RunPanel onCancel={cancelRun} />
          {tasks && <TasksPanel tasks={tasks} onClose={() => setIsTasksOpen(false)} />}

          {busy && turns.at(-1)?.role === "user" && <StreamStatusLine turn={null} onOpenTasks={openTasks} planProgress={planProgress} onOpenPlan={openPlan} />}
        </div>
        </LocalPathOpenerContext.Provider>
        )}

        <div
          className={cn(
            // pt-4 is the gap to the transcript: the scroll area ends at this
            // element's edge, so without it the last visible line sits flush
            // against the input. Padding, not margin — mt-auto anchors this to
            // the bottom and a second margin utility would replace it.
            "relative z-10 mt-auto w-full shrink-0 pt-4 pb-6",
            view === "home"
              ? "ml-auto max-w-md px-[var(--spacing-app-panel-gutter-inline)]"
              // Narrower than the transcript on purpose, and centred under it.
              : cn(COMPOSER_WIDTH, "px-[var(--spacing-app-panel-gutter-inline)]"),
          )}
        >
          {view === "chat" && !atBottom && turns.length > 0 && (
            <div className="pointer-events-none absolute inset-x-0 -top-12 z-20 flex justify-center">
              <JumpToLatestButton
                size="sm"
                onClick={jumpToLatest}
                className="pointer-events-auto gap-1 shadow-lg"
              >
                <ChevronDownIcon className="size-4" />
                Jump to latest
              </JumpToLatestButton>
            </div>
          )}
          <div
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes("Files")) return;
              e.preventDefault();
              setIsDraggingImage(true);
            }}
            onDragLeave={(e) => {
              // Crossing into a child fires dragleave on the composer too.
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setIsDraggingImage(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              // Without this the drop also bubbles to <main>'s onDrop and the
              // same file is added twice.
              e.stopPropagation();
              setIsDraggingImage(false);
              if (e.dataTransfer.files.length) void addImageFiles(e.dataTransfer.files);
            }}
            className={cn(
              // 18px radius and a ~104px resting height: a floating input
              // surface, not a pill.
              "relative flex min-h-[104px] flex-col gap-2.5 rounded-[18px] bg-surface-chat-composer p-3 [-webkit-backdrop-filter:var(--backdrop-composer-glass)] [backdrop-filter:var(--backdrop-composer-glass)]",
              isDraggingImage && "outline outline-2 outline-offset-[-2px] outline-primary",
            )}
          >
            {mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-80 overflow-hidden rounded-2xl border border-agent-border bg-agent-surface-raised p-2 shadow-[0_20px_56px_rgba(0,0,0,0.5)]">
                <div className="flex items-center gap-1 px-1 pb-2 text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      clearFileMatches();
                      setMentionQuery("");
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs transition-colors",
                      !fileMode
                        ? "bg-agent-surface-hover text-agent-text-bright"
                        : "text-agent-text-faint hover:text-agent-text-bright",
                    )}
                  >
                    Agents <span className="text-agent-text-faint">@</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMentionQuery("/");
                      requestFiles("");
                    }}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs transition-colors",
                      fileMode
                        ? "bg-agent-surface-hover text-agent-text-bright"
                        : "text-agent-text-faint hover:text-agent-text-bright",
                    )}
                  >
                    Files <span className="text-agent-text-faint">@</span>
                  </button>
                  <span className="px-2 py-1 text-xs text-agent-text-faint">
                    Skills /
                  </span>
                </div>
                <div className="max-h-72 overflow-y-auto pr-1">
                  {mentionMatches.map((a, i) => (
                    <button
                      key={a.id}
                      type="button"
                      ref={(el) => {
                        mentionItemRefs.current[i] = el;
                      }}
                      onMouseEnter={() => setMentionIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickMention(a);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
                        i === mentionIndex && "bg-agent-surface-hover",
                      )}
                    >
                      <AgentAvatar
                        name={a.name}
                        seed={a.id}
                        tint={a.tint}
                        icon={a.icon}
                        character={a.character}
                        size="sm"
                        className="size-7 shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate text-agent-text-bright">
                        {a.name}
                      </span>
                      {!a.builtin && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          Custom
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {fileMode && fileMatches.length > 0 && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-96 overflow-hidden rounded-2xl border border-agent-border bg-agent-surface-raised p-2 shadow-[0_20px_56px_rgba(0,0,0,0.5)]">
                <div className="px-2 pb-2 text-xs text-agent-text-faint">
                  Files matching “{mentionQuery}”
                </div>
                <div className="max-h-72 overflow-y-auto pr-1">
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
                        "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left font-mono text-xs transition-colors",
                        i === mentionIndex && "bg-agent-surface-hover",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-agent-text-bright">
                        {path}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {imgQuery !== null && (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-96 overflow-hidden rounded-2xl border border-agent-border bg-agent-surface-raised p-2 shadow-[0_20px_56px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-between gap-2 px-2 pb-2 text-xs text-agent-text-faint">
                  <span>
                    {imageLibrary.length === 0
                      ? "No images uploaded yet"
                      : "Uploaded images"}
                  </span>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      imageInputRef.current?.click();
                    }}
                    className="text-agent-text-bright hover:underline"
                  >
                    Upload new
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto pr-1">
                  {imgMatches.map((image) => {
                    const attached = imageAttachments.some(
                      (a) => a.previewUrl === image.previewUrl,
                    );
                    return (
                      <button
                        key={image.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          attachFromLibrary(image);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-agent-surface-hover"
                      >
                        <img
                          src={image.previewUrl}
                          alt=""
                          className="size-9 shrink-0 rounded object-cover"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-agent-text-bright">
                            {image.name}
                          </span>
                          <span className="truncate text-xs text-agent-text-faint">
                            {image.prompt || "No instructions yet"}
                          </span>
                        </span>
                        {attached && (
                          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Attached
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {(mentioned.length > 0 || chipAgent) && (
              <div className="flex flex-wrap items-center gap-1.5">
                {chipAgent && (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 py-0.5 pl-1 pr-1.5 text-xs text-primary">
                    <AgentAvatar
                      name={chipAgent.name}
                      seed={chipAgent.id}
                      tint={chipAgent.tint}
                      icon={chipAgent.icon}
                      character={chipAgent.character}
                      size="xs"
                      className="size-4 shrink-0 rounded-full"
                    />
                    <span className="font-medium">{chipAgent.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAgentId(null);
                        setManualActive((cur) => cur.filter((id) => id !== chipAgent.id));
                      }}
                      className="flex size-3.5 items-center justify-center rounded-full text-primary/70 hover:bg-primary/20 hover:text-primary"
                      aria-label={`Remove ${chipAgent.name}`}
                    >
                      ×
                    </button>
                  </span>
                )}
                {mentioned.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-agent-surface-raised py-0.5 pl-1 pr-2 text-xs text-foreground shadow-sm"
                  >
                    <AgentAvatar
                      name={a.name}
                      seed={a.id}
                      tint={a.tint}
                      icon={a.icon}
                      character={a.character}
                      size="sm"
                      className="size-4 shrink-0 rounded-full"
                    />
                    <span className="font-medium">@{a.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setMentioned((cur) => cur.filter((m) => m.id !== a.id));
                        if (selectedAgentId === a.id) setSelectedAgentId(null);
                        setManualActive((cur) => cur.filter((id) => id !== a.id));
                      }}
                      className="ml-0.5 flex size-3.5 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label={`Remove @${a.name}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            {imageAttachments.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {imageAttachments.map((image) => (
                  <div
                    key={image.id}
                    className="flex w-40 shrink-0 flex-col gap-1 rounded-lg border border-border/60 bg-agent-surface-raised p-1.5"
                  >
                    <div className="relative">
                      <button
                        type="button"
                        title={`View ${image.name}`}
                        aria-label={`View ${image.name}`}
                        onClick={() => setLightboxImage(image)}
                        className="block w-full"
                      >
                        <img
                          src={image.previewUrl}
                          alt={image.name}
                          className="h-16 w-full rounded object-cover"
                        />
                      </button>
                      <GlassButton
                        type="button"
                        size="icon-xs"
                        title={`Remove ${image.name}`}
                        aria-label={`Remove ${image.name}`}
                        className="absolute right-1 top-1"
                        onClick={() => removeImageAttachment(image.id)}
                      >
                        <XIcon />
                      </GlassButton>
                    </div>
                    <input
                      type="text"
                      ref={(el) => {
                        if (el && image.id === focusAttachmentId) {
                          el.focus();
                          setFocusAttachmentId(null);
                        }
                      }}
                      value={image.prompt}
                      onChange={(e) => setImageAttachmentPrompt(image.id, e.target.value)}
                      placeholder="What should change in this image?"
                      className="w-full rounded bg-transparent px-1 py-0.5 text-xs outline-none placeholder:text-placeholder-composer"
                    />
                  </div>
                ))}
              </div>
            )}
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void addImageFiles(e.target.files);
                e.target.value = "";
              }}
            />
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
                    const file = fileMatches[mentionIndex] ?? fileMatches[0];
                    if (file) pickFile(file);
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
                    const mention = mentionMatches[mentionIndex] ?? mentionMatches[0];
                    if (mention) pickMention(mention);
                    return;
                  }
                }
                if (event.key === "Escape" && mentionQuery !== null) {
                  setMentionQuery(null);
                  return;
                }
                if (event.key === "Escape" && imgQuery !== null) {
                  setImgQuery(null);
                  return;
                }
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={
                `Chat with ${selectedAgent?.name ?? (ready && engineLabel ? engineLabel : "Agent")}, @ for agents or files`
              }
              rows={1}
              disabled={!ready}
              className="min-h-[44px] max-h-[200px] w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm leading-relaxed outline-none placeholder:text-placeholder-composer focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex flex-wrap items-center gap-2">
                <EnginePicker
                  selectedEngineId={engineId || (project.status === "running" ? project.engineId : null) || undefined}
                  engines={enrichedEngines}
                  modelOption={modelOption}
                  modelValue={modelOption ? configValues[modelOption.id] : undefined}
                  effortOption={effortOption}
                  effortValue={activeEffortValue}
                  onSelectEffort={handleSelectEffort}
                  loading={project.status === "starting"}
                  isSettingModel={isSettingConfig}
                  pendingModelValue={pendingConfigValue}
                  isSwitchingEngine={isSwitchingEngine}
                  targetEngineId={targetEngineId}
                  onSelectModel={setConfig}
                  onSelect={handleSelectEngine}
                  onRequestManageProviders={openSettings}
                />

                <ModePicker
                  modes={modes}
                  onSelect={setMode}
                  disabled={!ready || busy || isCompacting}
                />

                <Popover open={projectPickerOpen} onOpenChange={setProjectPickerOpen}>
                  <PopoverTrigger asChild>
                    <ComposerActionButton
                      type="button"
                      size="sm"
                      leftIcon={
                        isChatWorkspaceActive ? (
                          <span className="size-2.5 rounded-full bg-muted-foreground/60" aria-hidden />
                        ) : (
                          <DefaultProjectGlyphIcon color={activeProjectEntry?.tint} className="size-4" />
                        )
                      }
                      rightIcon={<ChevronDownIcon className="size-3.5 opacity-50" />}
                      className="chat-composer-selector-trigger"
                    >
                      <span className="font-medium truncate max-w-40">
                        {isChatWorkspaceActive
                          ? NO_PROJECT_LABEL
                          : activeProjectEntry?.name || (activeDir ? basename(activeDir) : "Weave")}
                      </span>
                    </ComposerActionButton>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="top"
                    className="w-56 p-1.5 bg-[#1e1e20] border-border/60 rounded-xl shadow-xl"
                  >
                    <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
                      Projects
                    </div>
                    <div className="space-y-0.5">
                      {chatWorkspaceDir && (
                        <button
                          type="button"
                          onClick={() => {
                            setProjectPickerOpen(false);
                            if (!isChatWorkspaceActive) openProject(chatWorkspaceDir);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                            isChatWorkspaceActive
                              ? "bg-accent font-medium text-foreground"
                              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
                              <span className="size-2.5 rounded-full bg-muted-foreground/60" />
                            </span>
                            <span className="truncate">{NO_PROJECT_LABEL}</span>
                          </div>
                          {isChatWorkspaceActive && <CheckIcon className="ml-2 size-4 shrink-0 text-muted-foreground" />}
                        </button>
                      )}
                      {pickerProjects.map((p) => {
                        const isSelected = p.dir === activeDir;
                        const pLabel = p.archivedAt ? `${p.name || basename(p.dir)} (archived)` : p.name || basename(p.dir);
                        return (
                          <button
                            key={p.dir}
                            type="button"
                            onClick={() => {
                              setProjectPickerOpen(false);
                              if (p.dir !== activeDir) {
                                void startWith(p.dir, p.engineId);
                              }
                            }}
                            className={cn(
                              "flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                              isSelected
                                ? "bg-accent font-medium text-foreground"
                                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                            )}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <DefaultProjectGlyphIcon
                                color={p.tint}
                                className="size-4 shrink-0"
                              />
                              <span className="truncate">{pLabel}</span>
                            </div>
                            {isSelected && (
                              <CheckIcon className="size-4 shrink-0 text-muted-foreground ml-2" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-1 border-t border-border/40 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setProjectPickerOpen(false);
                          setEditingProject(null);
                          setCreateOpen(true);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      >
                        <PlusIcon className="size-3.5" />
                        <span>Open another project…</span>
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>

                {primaryConfigOption && primaryConfigOption.id !== effortOption?.id && (
                  <ConfigPicker
                    option={primaryConfigOption}
                    value={configValues[primaryConfigOption.id]}
                    childOptions={childConfigOptions}
                    childValues={configValues}
                    onSelect={setConfig}
                    disabled={!ready || busy || isCompacting}
                  />
                )}
              </div>
              {/* One action cluster: attach sits immediately left of send, and
                  keeps its place when send becomes stop. */}
              <div className="flex shrink-0 items-center gap-2">
                {ready && engineId && (
                  <ContextUsageButton
                    usage={contextUsage}
                    engineLabel={engineLabel ?? engineId}
                    reportsContextUsage={tokenReportingFor(engineId).contextWindow}
                    isCompactSupported={isCompactSupported}
                    canCompact={ready && !busy && !isCompacting && turns.length > 0}
                    isCompacting={isCompacting}
                    onCompact={compact}
                  />
                )}
                <ComposerActionButton
                  type="button"
                  size="icon-sm"
                  title="Attach images"
                  aria-label="Attach images"
                  disabled={!ready}
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImagePlusIcon />
                </ComposerActionButton>
                {busy || isCompacting ? (
                  <ComposerSendButton state="stop" onClick={cancel} />
                ) : (
                  <ComposerSendButton
                    state="send"
                    onClick={submit}
                    showLabel={Boolean(draft.trim() || imageAttachments.length > 0)}
                    disabled={!ready || (!draft.trim() && imageAttachments.length === 0)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        </>
        )}
        </main>

        <div
          className={cn(
            "relative h-fit max-h-full self-start shrink-0 overflow-hidden",
            // A drag in progress must track the pointer, not ease behind it.
            inspectorResize.resizing
              ? "transition-none"
              : "transition-[width,opacity] duration-200 ease-out",
            sidePanelOpen ? "opacity-100" : "w-0 opacity-0",
          )}
          style={
            sidePanelOpen
              ? { width: inspectorWidth }
              : undefined
          }
        >
          {sidePanelOpen && (diffPanelOpen || filePanelOpen || planPanelOpen) && (
            <div
              onMouseDown={inspectorResize.onResizeStart}
              onDoubleClick={inspectorResize.onResizeDoubleClick}
              title="Drag to resize · double-click to reset"
              className="group absolute top-0 bottom-0 -left-1.5 z-20 w-3 cursor-ew-resize"
              aria-hidden
            >
              <div className="absolute top-1/2 left-1/2 h-8 w-px -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent transition-colors group-hover:bg-border" />
            </div>
          )}
          <div
            className={filePanelOpen || planPanelOpen ? "h-full" : "h-fit max-h-full"}
            style={{ width: inspectorWidth }}
          >
            {filePanelOpen ? (
            <FileViewer key={openFilePath} />
            ) : planPanelOpen ? (
            <PlanPanel
              entries={planEntries}
              isExpanded={isPlanExpanded}
              onToggleExpanded={() => setIsPlanExpanded((value) => !value)}
              onClose={() => setClosedPlanSignature(planSignature)}
            />
            ) : diffPanelOpen ? (
            <TurnDiffPanel
              entries={turnDiffEntries}
              turnId={diffTurnId!}
              focusPath={diffFocusPath}
              onSelectTurn={(id) => {
                setDiffTurnId(id);
                setDiffFocusPath(undefined);
              }}
              onClose={(tab) => {
                setDiffTurnId(null);
                setContextOpen(true);
                if (tab) setContextTab(tab);
              }}
              projectDir={activeDir}
            />
            ) : (
            <ContextPanel
              tab={contextTab}
              onTabChange={setContextTab}
              turnDiffs={turnDiffEntries}
              onOpenDiff={(id, path) => {
                setDiffFocusPath(path);
                setDiffTurnId(id);
              }}
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
              pluginCatalog={pluginCatalog}
              projectPlugins={activeProjectEntry?.plugins ?? []}
              onProjectPluginsChange={(next) => {
                if (activeDir) setProjectPlugins(activeDir, next);
              }}
              manualPluginActive={manualPluginActive}
              onTogglePluginManual={(id) =>
                setManualPluginActive((cur) =>
                  cur.includes(id)
                    ? cur.filter((x) => x !== id)
                    : [...cur, id],
                )
              }
              engineId={engineId ?? undefined}
              engineLabel={engineLabel ?? undefined}
            />
            )}
          </div>
        </div>
        </>
        )}
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
          unarchive(dir);
          if (!editingProject && dir !== activeDir) void startWith(dir);
        }}
      />
      <ConfirmDialog
        open={archivingProject !== null}
        onOpenChange={(open) => {
          if (!open) setArchivingProject(null);
        }}
        title={`Archive ${archivingProject?.name || (archivingProject ? basename(archivingProject.dir) : "project")}?`}
        description="It will be hidden from the sidebar. Its chats and files stay untouched, and opening the same folder again brings it back."
        cancelLabel="Cancel"
        confirmLabel="Archive"
        onConfirm={() => {
          if (archivingProject) confirmArchiveProject(archivingProject);
          setArchivingProject(null);
        }}
      />


      <ImageLightbox
        src={lightboxImage?.previewUrl ?? ""}
        alt={lightboxImage?.name}
        downloadFilename={lightboxImage?.name}
        open={lightboxImage !== null}
        onOpenChange={(open) => {
          if (!open) setLightboxImage(null);
        }}
      />
      <StartupSplash
        isVisible={startupSplash.isVisible}
        message={startupSplash.message}
        progress={startupSplash.progress}
      />
    </div>
  );
}
