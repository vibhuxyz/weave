import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, Maximize2Icon, Minimize2Icon, Trash2Icon, XIcon } from "lucide-react";
import { cn } from "@/shared/lib";
import { MAX_FINISHED_TASKS } from "./constants";
import type { TaskList } from "./collect-tasks";
import { TaskCard } from "./TaskCard";

const ICON_BUTTON = "rounded-md p-1.5 text-agent-text-muted transition-colors hover:bg-agent-surface-hover hover:text-agent-text";

export function TasksPanel({ tasks, onClose }: { readonly tasks: TaskList; readonly onClose: () => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFinishedOpen, setIsFinishedOpen] = useState(true);
  const [clearedIds, setClearedIds] = useState<ReadonlySet<string>>(() => new Set());
  const finished = tasks.finished.filter((tool) => !clearedIds.has(tool.id));
  const shownFinished = finished.slice(0, MAX_FINISHED_TASKS);
  const Chevron = isFinishedOpen ? ChevronDownIcon : ChevronRightIcon;
  const Resize = isExpanded ? Minimize2Icon : Maximize2Icon;
  return (
    <aside
      aria-label="Background tasks"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      className={cn(
        "dark fixed top-16 right-4 bottom-24 z-40 flex flex-col overflow-hidden rounded-2xl border border-agent-border bg-agent-surface-raised shadow-[0_24px_80px_rgba(0,0,0,0.45)] transition-[width] motion-reduce:transition-none",
        isExpanded ? "w-[min(720px,calc(100vw-2rem))]" : "w-[min(420px,calc(100vw-2rem))]",
      )}
    >
      <header className="flex items-center gap-2 px-4 py-3">
        <h2 className="flex-1 text-agent-text-bright text-base">Background tasks</h2>
        <button type="button" onClick={() => setIsExpanded((value) => !value)} aria-label={isExpanded ? "Shrink panel" : "Expand panel"} className={ICON_BUTTON}>
          <Resize className="size-4" />
        </button>
        <button type="button" onClick={onClose} aria-label="Close background tasks" className={ICON_BUTTON}>
          <XIcon className="size-4" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {tasks.running.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-agent-text-muted text-sm">Running {tasks.running.length}</h3>
            <ul className="flex flex-col gap-2">
              {tasks.running.map((tool) => <TaskCard key={tool.id} tool={tool} />)}
            </ul>
          </section>
        )}
        {finished.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <button type="button" aria-expanded={isFinishedOpen} onClick={() => setIsFinishedOpen((value) => !value)} className="flex items-center gap-1 text-agent-text-muted text-sm hover:text-agent-text">
                Finished {finished.length}
                <Chevron className="size-3.5" />
              </button>
              <button type="button" onClick={() => setClearedIds(new Set([...clearedIds, ...finished.map((tool) => tool.id)]))} aria-label="Clear finished tasks" className={ICON_BUTTON}>
                <Trash2Icon className="size-4" />
              </button>
            </div>
            {isFinishedOpen && (
              <ul className="flex flex-col gap-2">
                {shownFinished.map((tool) => <TaskCard key={tool.id} tool={tool} />)}
                {finished.length > shownFinished.length && <li className="text-agent-text-faint text-xs">(+{finished.length - shownFinished.length} older)</li>}
              </ul>
            )}
          </section>
        )}
        {tasks.running.length === 0 && finished.length === 0 && <p className="text-agent-text-faint text-sm">No tasks yet.</p>}
      </div>
    </aside>
  );
}
