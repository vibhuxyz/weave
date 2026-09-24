import { useState } from "react";
import { CodeXmlIcon, FileTextIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/shared/lib";
import { isMarkdownPath, pathSegments } from "../path-parts";
import { useFileStore } from "../store";
import { FileBody } from "./FileBody";

const ICON_BUTTON = "rounded-md p-1.5 text-agent-text-muted transition-colors hover:bg-agent-surface-hover hover:text-agent-text";

export function FileViewer() {
  const { openPath, view, isExpanded, close, toggleExpanded } = useFileStore(
    useShallow((state) => ({ openPath: state.openPath, view: state.view, isExpanded: state.isExpanded, close: state.close, toggleExpanded: state.toggleExpanded })),
  );
  const [isSource, setIsSource] = useState(false);
  if (!openPath || !view) return null;
  const segments = pathSegments(openPath);
  const name = segments.at(-1) ?? openPath;
  const isMarkdown = isMarkdownPath(openPath);
  const Resize = isExpanded ? Minimize2Icon : Maximize2Icon;
  return (
    <aside aria-label={`File ${openPath}`} className="dark flex h-full flex-col overflow-hidden rounded-xl border border-border/60 bg-agent-surface-raised text-agent-text">
      <header className="flex shrink-0 items-center gap-2 px-3 py-2.5">
        <FileTextIcon className="size-4 shrink-0 text-agent-text-faint" />
        <span className="flex min-w-0 items-center gap-2 rounded-lg bg-agent-surface-hover py-1 pr-1.5 pl-3 text-sm">
          <span className="truncate italic">{name}</span>
          <button type="button" onClick={close} aria-label={`Close ${name}`} className="rounded p-0.5 text-agent-text-muted hover:text-agent-text">
            <XIcon className="size-3.5" />
          </button>
        </span>
        <span className="flex-1" />
        <button type="button" onClick={toggleExpanded} aria-label={isExpanded ? "Shrink panel" : "Expand panel"} className={ICON_BUTTON}>
          <Resize className="size-4" />
        </button>
        <button type="button" onClick={close} aria-label="Close file" className={ICON_BUTTON}>
          <XIcon className="size-4" />
        </button>
      </header>
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-agent-text-faint" title={openPath}>
          {segments.slice(0, -1).map((segment) => `${segment} / `).join("")}
          <span className="text-agent-text">{name}</span>
        </span>
        {isMarkdown && (
          <button type="button" onClick={() => setIsSource((value) => !value)} aria-pressed={isSource} aria-label={isSource ? "Show rendered" : "Show source"} className={cn(ICON_BUTTON, isSource && "text-agent-text-bright")}>
            <CodeXmlIcon className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <FileBody view={view} isRendered={isMarkdown && !isSource} />
      </div>
    </aside>
  );
}
