import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/shared/ui/ai-elements/message";
import { useAcpChat } from "./useAcpChat";
import { useProject } from "./useProject";

export function App() {
  const { state: project, choose } = useProject();
  const port = project.status === "running" ? project.port : null;
  const { state: connection, turns, busy, error, send, cancel } = useAcpChat(port);

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
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <header
        data-tauri-drag-region
        className="flex items-center justify-between border-b border-border py-3 pl-20 pr-6 text-xs"
      >
        <span className="truncate font-mono text-muted-foreground">
          {project.dir}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {ready ? "Claude Code" : connection}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={choose}>
            Change
          </Button>
        </div>
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
              {turn.tools.length > 0 && (
                <div className="flex flex-col gap-1">
                  {turn.tools.map((tool) => (
                    <div
                      key={tool.id}
                      className="flex items-center gap-2 rounded-md bg-secondary/60 px-3 py-1.5 font-mono text-xs"
                    >
                      <span
                        className={
                          tool.status === "completed"
                            ? "text-green-500"
                            : tool.status === "failed"
                              ? "text-red-500"
                              : "text-muted-foreground"
                        }
                      >
                        ●
                      </span>
                      <span className="truncate">{tool.title}</span>
                    </div>
                  ))}
                </div>
              )}
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
            placeholder="Ask Claude to fix a bug…"
            rows={2}
            disabled={!ready}
            className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />
          <div className="flex items-center justify-end">
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
    </div>
  );
}
