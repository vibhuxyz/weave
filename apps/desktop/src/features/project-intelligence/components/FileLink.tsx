import { useContext, type ReactNode } from "react";
import { LocalPathOpenerContext } from "@/shared/ui/ai-elements";
import { Mono } from "./ResultList";

function fileOf(target: string): string {
  return target.split("#")[0] ?? target;
}

export function FileLink({ target, children }: { readonly target: string; readonly children?: ReactNode }) {
  const openPath = useContext(LocalPathOpenerContext);
  const label = children ?? target;
  if (!openPath) return <Mono>{label}</Mono>;
  const path = fileOf(target);
  return (
    <button type="button" title={`Open ${path}`} onClick={() => openPath(path)} className="break-all text-left font-mono text-primary text-xs underline-offset-4 hover:underline">
      {label}
    </button>
  );
}
