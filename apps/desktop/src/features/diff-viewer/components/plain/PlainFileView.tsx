import { useState } from "react";
import { CodeXmlIcon } from "lucide-react";
import { isMarkdownPath, pathSegments } from "@/features/files";
import type { FileViewState } from "@/features/files";
import { cn } from "@/shared/lib";
import { MessageResponse } from "@/shared/ui/ai-elements";
import { DiffError, DiffLoading } from "../states";
import { PlainCode } from "./PlainCode";

const ICON_BUTTON = "rounded-md p-1.5 text-agent-text-muted transition-colors hover:bg-agent-surface-hover hover:text-agent-text";

export function PlainFileView({ path, view }: { readonly path: string; readonly view: FileViewState }) {
  const [isSource, setIsSource] = useState(false);
  const segments = pathSegments(path);
  const name = segments.at(-1) ?? path;
  const isMarkdown = isMarkdownPath(path);
  const showRendered = isMarkdown && !isSource;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pb-2 text-sm">
        <span className="min-w-0 flex-1 truncate text-agent-text-faint" title={path}>
          {segments.slice(0, -1).map((segment) => `${segment} / `).join("")}
          <span className="text-agent-text">{name}</span>
        </span>
        {isMarkdown && (
          <button
            type="button"
            onClick={() => setIsSource((value) => !value)}
            aria-pressed={isSource}
            aria-label={isSource ? "Show the rendered document" : "Show the source"}
            className={cn(ICON_BUTTON, isSource && "text-agent-text-bright")}
          >
            <CodeXmlIcon className="size-4" />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {view.status === "loading" && <DiffLoading />}
        {view.status === "error" && <DiffError message={view.message} />}
        {view.status === "loaded" && (
          <>
            {showRendered ? (
              <div className="px-5 py-4 text-agent-text text-sm leading-7">
                <MessageResponse mode="static">{view.content}</MessageResponse>
              </div>
            ) : (
              <PlainCode content={view.content} path={path} />
            )}
            {view.truncated && <p className="px-4 py-3 text-agent-text-faint text-xs">Showing the first 1 MB of this file.</p>}
          </>
        )}
      </div>
    </div>
  );
}
