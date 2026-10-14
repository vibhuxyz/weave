import { Children, createContext, isValidElement, useContext, type ComponentProps, type ReactNode } from "react";
import { localFilePathOf } from "@/shared/lib";

export type OpenLocalPath = (path: string) => void;

export const LocalPathOpenerContext = createContext<OpenLocalPath | null>(null);

const LINK_CLASS = "wrap-anywhere cursor-pointer text-agent-link-fg underline decoration-agent-link-fg/40 underline-offset-4 transition-colors hover:decoration-agent-link-fg";

function plainText(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      if (typeof child === "string" || typeof child === "number") return String(child);
      if (isValidElement<{ children?: ReactNode }>(child)) return plainText(child.props.children);
      return "";
    })
    .join("");
}

export function LocalPathButton({ path, children }: { readonly path: string; readonly children: ReactNode }) {
  const openPath = useContext(LocalPathOpenerContext);
  return (
    <button type="button" title={`Open ${path}`} onClick={() => openPath?.(path)} className={LINK_CLASS}>
      {children}
    </button>
  );
}

export function useLocalPathTarget(candidate: string | undefined): string | null {
  const openPath = useContext(LocalPathOpenerContext);
  if (!openPath || candidate === undefined) return null;
  return localFilePathOf(candidate);
}

export function MarkdownInlineCode({ children, node: _node, ...rest }: ComponentProps<"code"> & { node?: unknown }) {
  const text = plainText(children);
  const openPath = useContext(LocalPathOpenerContext);
  const path = useLocalPathTarget(text);
  if (path && openPath) {
    return (
      <button type="button" title={`Open ${path}`} data-streamdown="inline-code" className={rest.className} onClick={() => openPath(path)}>
        {text}
      </button>
    );
  }
  return (
    <code data-streamdown="inline-code" {...rest}>
      {children}
    </code>
  );
}
