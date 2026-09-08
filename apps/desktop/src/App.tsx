import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronDownIcon,
  ImagePlusIcon,
  PanelLeftIcon,
  PanelRightIcon,
  SearchIcon,
  ActivityIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import { ComposerActionButton } from "@/shared/ui/composer-action-button";
import { ComposerSendButton } from "@/shared/ui/composer-send-button";
import { GlassButton } from "@/shared/ui/glass-button";
import { ImageLightbox } from "@/shared/ui/ImageLightbox";
import type { ChatImageAttachmentDraft } from "@/shared/types/messages";
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
import { isAuthRequiredError } from "@weave/protocol";
import { ENGINES, DEFAULT_ENGINE_ID } from "@weave/agent/engines-registry.ts";
import { ConfigPicker } from "./ConfigPicker";
import { EnginePicker } from "./EnginePicker";
import { ProvidersDialog } from "./ProvidersDialog";
import { ContextPanel } from "./ContextPanel";
import { Sidebar } from "./Sidebar";
import { CreateProjectDialog, toneColor } from "./CreateProjectDialog";
import { AgentsView } from "./agents/AgentsView";
import { SkillsView } from "./skills/SkillsView";
import { useSkillPlugins, formatSkillPluginsSystemPrompt } from "./useSkillPlugins";
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
    pendingConfigValue,
    refreshGit,
    refreshEngines,
    newChat,
    openChat,
    updateTurnPlan,
  } = useAcpChat(port);

  const { projects, remember, setProjectAgents, forget } = useProjects();
  const { agents } = useAgents();
  const { plugins: skillPlugins } = useSkillPlugins();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<
    ProjectEntry | null
  >(null);
  const [previewTint, setPreviewTint] = useState<string>();
  // Manual agents the user turned on for the next new chat.
  const [manualActive, setManualActive] = useState<string[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const activeProjectEntry =
    project.status === "running"
      ? projects.find((p) => p.dir === project.dir)
      : undefined;
  const [view, setView] = usePersistedState<"home" | "chat" | "agents" | "skills">(
    "berd:view",
    "home",
    // Legacy "chat" (pre-home-split) starts at home rather than a blank
    // transcript; "agents" and "skills" are preserved.
    (v, d) => (v === "home" || v === "agents" || v === "skills" ? v : d),
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
      if (activeDir) remember(activeDir, id);
      if (connection === "ready") switchEngine(id);
      else if (activeDir) void startWith(activeDir, id);
    },
    [engineId, project, authRequired, clearAuth, activeDir, remember, connection, switchEngine, startWith],
  );



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
      setSelectedAgentId(agent.id);
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
    // otherwise scrolling up to read is fought by every new chunk.
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [turns]);

  // @-mentioned agents applied to the *next* message only.
  const [mentioned, setMentioned] = useState<Agent[]>([]);
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
    setMentionQuery(m ? m[1] : null);
    const img = /(?:^|\s)\/img[ ]?([\w. -]*)$/.exec(head);
    setImgQuery(img ? img[1] : null);
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
      setImageAttachments((cur) => [...cur, image]);
      setImageLibrary((cur) => [...cur, image]);
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

  const submit = () => {
    if (!draft.trim() && imageAttachments.length === 0) return;
    // Standing agents (`always` + manually toggled) plus this message's
    // @-mentions ride every prompt, so the persona can't drift over a chat.
    // The server merges this with the skills catalog into one <system> block.
    const persona = formatPersonaSystemPrompt(activeProjectEntry?.agents, agents, [
      ...manualActive,
      ...mentioned.map((a) => a.id),
    ]);
    const plugins = formatSkillPluginsSystemPrompt(skillPlugins, activeDir);

    let textToSend = draft;
    if (draft.trim().startsWith("/plan ") || draft.trim() === "/plan") {
      const task = draft.trim().slice(5).trim();
      textToSend = task
        ? `[Planning Mode]\nPlease inspect the workspace and propose a step-by-step execution plan for the following task, formatted inside a <plan> block with numbered steps. DO NOT modify any files or execute commands yet until I review and approve the plan:\n\n${task}`
        : `[Planning Mode]\nPlease inspect the current status and propose a step-by-step execution plan inside a <plan> block with numbered steps before modifying any files or running commands.`;
    }

    send(textToSend, {
      persona: [persona, plugins].filter(Boolean).join("\n\n") || undefined,
      mentions: mentioned.map((a) => a.name),
      images: imageAttachments,
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
      className="bg-dot-grid flex h-dvh flex-col text-foreground"
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
          {authRequired && (
            <div className="z-30 w-full shrink-0 border-b border-border bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
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
                  onCancel={cancelAuth}
                  onDismiss={clearAuth}
                />
              </div>
            </div>
          )}

          {error && !isAuthRequiredError(error) && !authRequired && (() => {
            const match = error.match(/is not installed \((.*?)\)/);
            return (
              <div className="z-30 w-full shrink-0 border-b border-destructive/20 bg-destructive/10 px-6 py-2.5">
                <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 text-sm text-destructive">
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
              </div>
            );
          })()}
        {view === "agents" ? (
          <AgentsView onChat={handleChatWithAgent} engines={engines} />
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
                      onUpdatePlan={updateTurnPlan}
                    />
                    )}
                  </>
                ) : (
                  <UserMessage
                    text={turn.text}
                    mentions={turn.mentions}
                    images={turn.images}
                    onEdit={editPrompt}
                    onViewImage={setLightboxImage}
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
              setIsDraggingImage(false);
              if (e.dataTransfer.files.length) void addImageFiles(e.dataTransfer.files);
            }}
            className={cn(
              "relative flex flex-col gap-2.5 rounded-composer bg-surface-chat-composer p-3 [-webkit-backdrop-filter:var(--backdrop-composer-glass)] [backdrop-filter:var(--backdrop-composer-glass)]",
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
            {mentioned.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
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
                if (event.key === "Escape" && imgQuery !== null) {
                  setImgQuery(null);
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={
                selectedAgentId
                  ? `Chat with ${agents.find((a) => a.id === selectedAgentId)?.name || "Agent"}…`
                  : `Chat with ${ready && engineLabel ? engineLabel : "Agent"}…`
              }
              rows={1}
              disabled={!ready}
              className="min-h-[44px] max-h-[200px] w-full resize-none overflow-y-auto bg-transparent px-2 py-1.5 text-sm leading-relaxed outline-none placeholder:text-placeholder-composer focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-2 px-1">
              <div className="flex flex-wrap items-center gap-2">
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
                <EnginePicker
                  selectedEngineId={engineId || (project.status === "running" ? project.engineId : null) || undefined}
                  engines={engines}
                  modelOption={modelOption}
                  modelValue={modelOption ? configValues[modelOption.id] : undefined}
                  loading={project.status === "starting"}
                  isSettingModel={isSettingConfig}
                  pendingModelValue={pendingConfigValue}
                  isSwitchingEngine={isSwitchingEngine}
                  targetEngineId={targetEngineId}
                  onSelectModel={setConfig}
                  onSelect={handleSelectEngine}
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
        </>
        )}
        </main>

        <div
          className={cn(
            "shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out",
            contextOpen && view === "chat"
              ? "w-72 opacity-100"
              : "w-0 opacity-0",
          )}
        >
          <div className="h-full w-72">
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
        engines={engines}
        currentEngineId={project.status === "running" ? project.engineId : engineId}
        installingEngine={installingEngineId}
        onInstall={handleInstallEngine}
        onUninstall={handleUninstallEngine}
        onSelectEngine={handleSelectEngine}
        onRefresh={refreshEngines}
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
    </div>
  );
}
