import type { ReactNode } from "react";
import { CheckIcon, CopyIcon, PencilIcon } from "lucide-react";
import { AgentAvatar } from "./agents/AgentAvatar";
import { useCopyToClipboard } from "./hooks/use-copy-to-clipboard";
import { cn } from "@/shared/lib/cn";
import type { ChatImageAttachment } from "./useAcpChat";

/**
 * A user turn: the prompt text plus hover actions to copy it or drop it back
 * into the composer for a re-send.
 *
 * "Edit" does not rewind the conversation — ACP has no branch-from-here
 * primitive here. It refills the composer; sending appends a fresh prompt and
 * the original turn stays in the transcript.
 */
export function UserMessage({
  text,
  mentions,
  images,
  onEdit,
  onViewImage,
}: {
  text: string;
  mentions?: string[];
  images?: ChatImageAttachment[];
  onEdit?: (text: string) => void;
  onViewImage?: (image: ChatImageAttachment) => void;
}) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  return (
    <div className="flex flex-col items-end gap-1.5">
      {images && images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {images.map((image, i) => (
            <div
              key={i}
              className="flex w-40 flex-col gap-1 rounded-lg border border-border/60 bg-agent-surface-raised p-1.5"
            >
              <button
                type="button"
                title="View image"
                aria-label="View image"
                onClick={() => onViewImage?.(image)}
                className="block w-full"
              >
                <img
                  src={image.previewUrl}
                  alt=""
                  className="h-24 w-full rounded object-cover"
                />
              </button>
              {image.prompt && (
                <p className="text-xs text-agent-text-faint">{image.prompt}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {mentions && mentions.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1">
          {mentions.map((name) => (
            <span
              key={name}
              className="flex items-center gap-1 rounded-md bg-agent-accent-wash px-1.5 py-0.5 text-agent-accent text-xs"
            >
              <AgentAvatar name={name} size="sm" className="size-4" />
              {name}
            </span>
          ))}
        </div>
      )}
      {text && <div className="whitespace-pre-wrap">{text}</div>}
      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <ActionButton
          label={isCopied ? "Copied" : "Copy"}
          onClick={() => copyToClipboard(text)}
        >
          {isCopied ? (
            <CheckIcon className="size-3.5 text-agent-success" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </ActionButton>
        {onEdit && (
          <ActionButton label="Edit & re-send" onClick={() => onEdit(text)}>
            <PencilIcon className="size-3.5" />
          </ActionButton>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "rounded p-1 text-muted-foreground transition-colors",
        "hover:bg-secondary hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
