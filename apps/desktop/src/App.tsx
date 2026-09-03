import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/shared/ui/button";
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
import { AgentMessage } from "./agent/components/AgentMessage";
import { basename } from "./paths";
import { useAcpChat } from "./useAcpChat";
import { useProject } from "./useProject";

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
    resumed,
    send,
    cancel,
    setConfig,
    refreshGit,
    newChat,
  } = useAcpChat(port);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [installingEngine, setInstallingEngine] = useState(false);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  const submit = () => {
    send(draft);
    setDraft("");
  };

  // ── No project yet: the whole app is the picker ──────────────────────
  if (project.status !== "running") {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background text-foreground">
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

  return (
    <div className="flex h-dvh gap-2 bg-background p-2 text-foreground">
      <Sidebar
        projectDir={project.dir}
        onChooseProject={choose}
        onNewChat={newChat}
        resumed={resumed}
      />

      <main className="flex min-w-0 flex-1 flex-col rounded-xl bg-secondary/20">
        <header
          data-tauri-drag-region
          className="flex items-center justify-between px-6 py-3 text-xs"
        >
          <span className="truncate text-muted-foreground">
            {basename(project.dir)}
          </span>
          <div className="flex items-center gap-3">
            {!ready && <span className="text-muted-foreground">{connection}</span>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none flex items-center gap-1">
                  {engineLabel || ENGINES[(project.status === "running" ? project.engineId : null) || engineId || DEFAULT_ENGINE_ID]?.label || "Agent"}
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
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
          {turns.length === 0 && ready && (
            <p className="mt-16 text-center text-sm text-muted-foreground">
              Ask {engineLabel || "the agent"} to fix a bug in this project.
            </p>
          )}

          {turns.map((turn) => (
            <Message key={turn.id} from={turn.role}>
              <MessageContent>
                {turn.role === "assistant" ? (
                  (turn.text || turn.tools.length > 0) && (
                    <AgentMessage
                      turn={turn}
                      projectDir={project.dir}
                      git={git}
                      configValues={configValues}
                      engineId={engineId!}
                      engineLabel={engineLabel!}
                      running={busy}
                    />
                  )
                ) : (
                  turn.text
                )}
              </MessageContent>
            </Message>
          ))}

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

        <div className="mx-auto w-full max-w-3xl p-6 pt-0">
          <div className="flex flex-col gap-3 rounded-2xl bg-secondary/50 p-3">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              placeholder={`Chat with ${ready && engineLabel ? engineLabel : "Agent"}…`}
              rows={2}
              disabled={!ready}
              className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-2">
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
                <Button type="button" size="sm" variant="subtle" onClick={cancel}>
                  Stop
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
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

      <ContextPanel
        projectDir={project.dir}
        git={git}
        onRefresh={refreshGit}
      />
    </div>
  );
}
