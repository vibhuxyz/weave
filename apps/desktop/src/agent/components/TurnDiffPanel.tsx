import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { useCopyToClipboard } from "../../hooks/use-copy-to-clipboard";
import { relativePath, type DiffLine, type FileDiff, type TurnDiffEntry } from "../diff/turnDiff";
import { CONTEXT_PANEL_TABS, type ContextPanelTab } from "../../ContextPanel";

/**
 * The side-panel diff reader. Opened from an assistant card's "Open diff";
 * while it is up it replaces the context panel, and the shell widens to fit
 * code at a readable width.
 */
export function TurnDiffPanel({
  entries,
  turnId,
  focusPath,
  onSelectTurn,
  onClose,
  projectDir,
}: {
  entries: TurnDiffEntry[];
  turnId: string;
  /** A file the chat asked to inspect — it opens alone and scrolls into view. */
  focusPath?: string;
  onSelectTurn: (turnId: string) => void;
  /** Leave the diff; the tab picks which context tab comes back. */
  onClose: (tab?: ContextPanelTab) => void;
  projectDir?: string | null;
}) {
  const entry = entries.find((e) => e.turnId === turnId) ?? entries.at(-1);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [turnMenu, setTurnMenu] = useState(false);

  const fileRefs = useRef(new Map<string, HTMLElement>());

  // A fresh turn opens with every file expanded — unless the chat pointed at
  // one file, which then opens alone and is scrolled to.
  useEffect(() => {
    if (!entry) return;
    if (focusPath) {
      setCollapsed(
        new Set(entry.diff.files.map((f) => f.path).filter((p) => p !== focusPath)),
      );
      fileRefs.current
        .get(focusPath)
        ?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    setCollapsed(new Set());
  }, [entry, focusPath]);

  const totals = useMemo(
    () =>
      entry
        ? { files: entry.diff.files.length, add: entry.diff.additions, del: entry.diff.deletions }
        : { files: 0, add: 0, del: 0 },
    [entry],
  );

  if (!entry) {
    return (
      <aside className="flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-border/60 bg-agent-surface-raised p-4">
        <PanelHead onClose={onClose} />
        <p className="text-muted-foreground text-xs">No file changes in this chat yet.</p>
      </aside>
    );
  }

  return (
    <aside className="dark flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-agent-surface-raised text-agent-text">
      <div className="shrink-0 px-4 pt-4">
        <PanelHead onClose={onClose} />
      </div>

      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setTurnMenu((v) => !v)}
            disabled={entries.length < 2}
            className="flex items-center gap-1.5 rounded-lg bg-agent-surface-hover px-2.5 py-1.5 text-agent-text-bright text-xs disabled:opacity-70"
          >
            Turn {entry.index}
            {entries.length > 1 && <ChevronDownIcon className="size-3.5" />}
          </button>
          {turnMenu && entries.length > 1 && (
            <div className="absolute top-full left-0 z-20 mt-1 min-w-40 rounded-lg border border-agent-border bg-agent-surface-raised py-1 shadow-lg">
              {entries.map((item) => (
                <button
                  key={item.turnId}
                  type="button"
                  onClick={() => {
                    onSelectTurn(item.turnId);
                    setTurnMenu(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-agent-surface-hover",
                    item.turnId === entry.turnId
                      ? "text-agent-text-bright"
                      : "text-agent-text-faint",
                  )}
                >
                  <span>Turn {item.index}</span>
                  <span className="ml-auto font-mono text-[10px]">
                    {item.diff.files.length} file{item.diff.files.length === 1 ? "" : "s"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="font-medium text-agent-text-bright text-xs">
          {totals.files} changed file{totals.files === 1 ? "" : "s"}
        </span>
        <span className="font-mono text-xs">
          <span className="text-agent-success">+{totals.add}</span>{" "}
          <span className="text-agent-critical-fg">−{totals.del}</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 pb-4">
        {entry.diff.files.map((file) => (
          <FileDiffView
            key={file.path}
            file={file}
            projectDir={projectDir}
            focused={file.path === focusPath}
            registerRef={(el) => {
              if (el) fileRefs.current.set(file.path, el);
              else fileRefs.current.delete(file.path);
            }}
            open={!collapsed.has(file.path)}
            onToggle={() =>
              setCollapsed((prev) => {
                const next = new Set(prev);
                if (next.has(file.path)) next.delete(file.path);
                else next.add(file.path);
                return next;
              })
            }
          />
        ))}
      </div>
    </aside>
  );
}

/**
 * The same tab strip the context panel wears, with "Files" holding the diff —
 * picking another tab hands the panel back to the context view on that tab.
 */
function PanelHead({ onClose }: { onClose: (tab?: ContextPanelTab) => void }) {
  return (
    <div className="flex items-center gap-4 border-agent-border border-b pb-2 text-sm">
      {CONTEXT_PANEL_TABS.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => name !== "Files" && onClose(name)}
          className={cn(
            "transition-colors",
            name === "Files"
              ? "border-agent-accent border-b-2 pb-1 text-agent-text-bright"
              : "text-agent-text-faint hover:text-agent-text-bright",
          )}
        >
          {name}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onClose()}
        title="Close diff"
        aria-label="Close diff"
        className="ml-auto text-agent-text-faint transition-colors hover:text-agent-text-bright"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}

function FileDiffView({
  file,
  open,
  onToggle,
  projectDir,
  focused,
  registerRef,
}: {
  file: FileDiff;
  open: boolean;
  onToggle: () => void;
  projectDir?: string | null;
  focused?: boolean;
  registerRef?: (el: HTMLElement | null) => void;
}) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  return (
    <section
      ref={registerRef}
      className={cn(
        "shrink-0 overflow-hidden rounded-lg border bg-agent-code-bg",
        focused ? "border-agent-accent/50" : "border-agent-code-border",
      )}
    >
      {/* Sticky so the file you are reading stays named while its diff scrolls. */}
      <div className="sticky top-0 z-10 flex items-center gap-2 border-agent-code-border border-b bg-agent-code-header-bg px-2.5 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRightIcon
            className={cn(
              "size-3.5 shrink-0 text-agent-text-faint transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="truncate font-mono text-[11px] text-agent-text-bright" title={file.path}>
            {relativePath(file.path, projectDir)}
          </span>
        </button>
        <span className="shrink-0 font-mono text-[11px]">
          <span className="text-agent-critical-fg">−{file.deletions}</span>{" "}
          <span className="text-agent-success">+{file.additions}</span>
        </span>
        <button
          type="button"
          onClick={() => copyToClipboard(hunksToPatch(file))}
          className="shrink-0 text-[10px] text-agent-text-faint transition-colors hover:text-agent-text-bright"
        >
          {isCopied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* One long file must not push the rest of the change set out of reach:
          each diff scrolls inside its own viewport. */}
      {open && (
        <div className="max-h-[55vh] overflow-y-auto overscroll-contain">
          {file.truncated && (
            <p className="px-2.5 py-1 text-[10px] text-agent-text-faint">
              Large file — shown as a wholesale replacement.
            </p>
          )}
          {file.hunks.map((hunk, hi) => (
            <div key={hi}>
              {(hunk.skippedBefore ?? 0) > 0 && (
                <div className="border-agent-code-border/60 border-y bg-agent-surface-hover/30 py-1 text-center font-mono text-[10px] text-agent-text-faint">
                  {hunk.skippedBefore} unmodified line
                  {hunk.skippedBefore === 1 ? "" : "s"}
                </div>
              )}
              {hi > 0 && (hunk.skippedBefore ?? 0) === 0 && (
                <div className="py-0.5 text-center font-mono text-[11px] text-agent-text-faint">
                  ···
                </div>
              )}
              {hunk.lines.map((line, li) => (
                <DiffLineRow key={`${hi}-${li}`} line={line} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 px-2 font-mono text-[11px] leading-[1.6]",
        line.kind === "add" && "bg-agent-success/10 text-agent-success",
        line.kind === "del" && "bg-agent-critical-fg/10 text-agent-critical-fg",
        line.kind === "context" && "text-agent-text",
      )}
    >
      <span className="w-10 shrink-0 select-none text-right text-agent-text-faint">
        {line.kind === "add" ? line.newLine : line.oldLine}
      </span>
      <span className="w-2 shrink-0 select-none">
        {line.kind === "add" ? "+" : line.kind === "del" ? "−" : " "}
      </span>
      <span className="whitespace-pre-wrap break-words">{line.text || " "}</span>
    </div>
  );
}

/** The file's hunks as a plain unified-ish patch, for the copy button. */
function hunksToPatch(file: FileDiff): string {
  const out: string[] = [`--- a/${file.path}`, `+++ b/${file.path}`];
  file.hunks.forEach((hunk, i) => {
    if (i > 0) out.push("@@");
    for (const line of hunk.lines) {
      out.push(
        `${line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}${line.text}`,
      );
    }
  });
  return out.join("\n");
}
