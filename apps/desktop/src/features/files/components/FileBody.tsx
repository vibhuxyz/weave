import { MessageResponse } from "@/shared/ui/ai-elements";
import type { FileViewState } from "../types";
import { CodeView } from "./CodeView";

export function FileBody({ view, isRendered }: { readonly view: FileViewState; readonly isRendered: boolean }) {
  switch (view.status) {
    case "loading":
      return <div className="m-4 h-40 animate-pulse rounded-lg bg-agent-surface-hover motion-reduce:animate-none" />;
    case "error":
      return <p className="px-4 py-3 text-agent-critical-fg text-sm">{view.message}</p>;
    case "loaded":
      return (
        <>
          {isRendered ? (
            <div className="px-5 py-4 text-agent-text text-sm leading-7">
              <MessageResponse mode="static">{view.content}</MessageResponse>
            </div>
          ) : (
            <CodeView content={view.content} />
          )}
          {view.truncated && <p className="px-4 py-3 text-agent-text-faint text-xs">Showing the first 1 MB of this file.</p>}
        </>
      );
    default: {
      const unreachable: never = view;
      return unreachable;
    }
  }
}
