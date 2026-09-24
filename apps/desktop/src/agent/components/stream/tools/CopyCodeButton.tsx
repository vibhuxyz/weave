import { CheckIcon, CopyIcon } from "lucide-react";
import { useCopyToClipboard } from "@/shared/hooks";

export function CopyCodeButton({ text, label }: { readonly text: string; readonly label: string }) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const CopyStateIcon = isCopied ? CheckIcon : CopyIcon;
  return (
    <button
      type="button"
      aria-label={isCopied ? "Copied" : label}
      onClick={() => copyToClipboard(text)}
      className="absolute top-2 right-2 rounded-md p-1 text-agent-text-muted transition-colors hover:bg-foreground/[0.06] hover:text-agent-text-bright"
    >
      <CopyStateIcon className="size-3.5" />
    </button>
  );
}
