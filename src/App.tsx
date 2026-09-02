import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/shared/ui/ai-elements/message";
import { ConfigPicker } from "./ConfigPicker";
import { ContextPanel } from "./ContextPanel";
import { Sidebar } from "./Sidebar";
import { ToolSteps } from "./ToolSteps";
import { basename } from "./paths";
import { useAcpChat } from "./useAcpChat";
import { useProject } from "./useProject";

export function App() {
  const { state: project, choose } = useProject();
  const port = project.status === "running" ? project.port : null;
  const {
    state: connection,
    turns,
    busy,
    error,
    configOptions,
    configValues,
    git,
    send,
    cancel,
    setConfig,
    refreshGit,
  } = useAcpChat(port);

  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

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
            Choose a project folder. Claude will read and edit files inside it.
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
      <Sidebar projectDir={project.dir} onChooseProject={choose} />

      <main className="flex min-w-0 flex-1 flex-col rounded-xl bg-secondary/20">
        <header
          data-tauri-drag-region
          className="flex items-center justify-between px-6 py-3 text-xs"
        >
          <span className="truncate text-muted-foreground">
            {basename(project.dir)}
          </span>
          <span className="text-muted-foreground">
            {ready ? "Claude Code" : connection}
          </span>
        </header>

        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 overflow-y-auto p-6">
          {turns.length === 0 && ready && (
            <p className="mt-16 text-center text-sm text-muted-foreground">
              Ask Claude to fix a bug in this project.
            </p>
          )}

          {turns.map((turn) => (
            <Message key={turn.id} from={turn.role}>
              <MessageContent>
                <ToolSteps tools={turn.tools} />
                {turn.role === "assistant"
                  ? turn.text && <MessageResponse>{turn.text}</MessageResponse>
                  : turn.text}
              </MessageContent>
            </Message>
          ))}

          {error && (
            <p className="rounded-md bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
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
              placeholder="Chat with Claude Code…"
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
