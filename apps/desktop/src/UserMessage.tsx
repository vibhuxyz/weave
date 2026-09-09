import { useEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, ImageOffIcon, PencilIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { AgentAvatar } from "./agents/AgentAvatar";
import { useCopyToClipboard } from "./hooks/use-copy-to-clipboard";
import { cn } from "@/shared/lib/cn";
import type { ChatImageAttachment } from "./useAcpChat";

/**
 * A user turn: the prompt, its attachments, and hover actions to copy or edit.
 *
 * "Edit" does not rewind the conversation — ACP has no branch-from-here
 * primitive. The bubble becomes an editor in place and Send appends a fresh
 * prompt; the original turn stays in the transcript.
 */
export function UserMessage({
  text,
  mentions,
  images,
  onEdit,
  onResend,
  onViewImage,
}: {
  text: string;
  mentions?: string[];
  images?: ChatImageAttachment[];
  /** Fallback when there is nowhere to send from: refill the composer. */
  onEdit?: (text: string) => void;
  /** Send an edited copy of this prompt as a new turn. */
  onResend?: (text: string, images: ChatImageAttachment[]) => void;
  onViewImage?: (image: ChatImageAttachment) => void;
}) {
  const { isCopied, copyToClipboard } = useCopyToClipboard();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, and put the caret at the end when the editor opens.
  useEffect(() => {
    const el = editorRef.current;
    if (!editing || !el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, editing]);

  const startEditing = () => {
    if (!onResend) {
      onEdit?.(text);
      return;
    }
    setDraft(text);
    setEditing(true);
  };

  const sendEdit = () => {
    const next = draft.trim();
    if (!next) return;
    setEditing(false);
    onResend?.(next, images ?? []);
  };

  const [expanded, setExpanded] = useState(false);
  // A long prompt is a task header, not a wall of text: two lines, then the
  // user opens it.
  const clamped = !expanded && text.split("\n").length + text.length / 90 > 2.2;

  return (
    // Right aligned and shrink-wrapped: the bubble is as wide as the prompt,
    // up to 80% of the column. Attachments sit ABOVE it, unframed — they are
    // what the user showed, not a field inside what they wrote — and the hover
    // actions hang below, absolutely placed so they reserve no height.
    <div className="group relative flex w-full flex-col items-end gap-1.5">
      {!editing && images && images.length > 0 && (
        <div className="flex max-w-[80%] flex-wrap justify-end gap-2">
          {images.map((image, i) => (
            <div key={i} className="flex w-56 max-w-full flex-col gap-1">
              <Thumbnail image={image} onView={onViewImage} />
              {image.prompt && (
                <p className="px-1 text-right text-muted-foreground text-xs">
                  {image.prompt}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {editing ? (
        // The editor takes the bubble's place rather than opening elsewhere,
        // so the prompt stays where the user was already looking. Neutral
        // surface, no inner frame: the card IS the field.
        <div className="flex w-full max-w-[80%] flex-col gap-3 rounded-3xl bg-message-edit-surface p-4 shadow-(--message-user-shadow)">
          {images && images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((image, i) =>
                image.previewUrl ? (
                  <img
                    key={i}
                    src={image.previewUrl}
                    alt=""
                    className="size-20 rounded-2xl border border-white/10 object-cover"
                  />
                ) : (
                  <div
                    key={i}
                    className="flex size-20 items-center justify-center rounded-2xl border border-white/10 bg-black/20"
                  >
                    <ImageOffIcon className="size-4 text-agent-text-faint" />
                  </div>
                ),
              )}
            </div>
          )}
          <textarea
            ref={editorRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
                return;
              }
              // Enter sends, Shift+Enter breaks the line — the composer's
              // bargain, so the editor does not need learning.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendEdit();
              }
            }}
            rows={1}
            className={cn(
              "max-h-64 w-full resize-none border-0 bg-transparent px-1",
              "text-[0.9375rem] text-foreground leading-relaxed",
              // globals.css puts a 2px focus ring on everything focusable.
              // Here the card is the field, so the ring would draw a second
              // box inside it.
              "shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
            )}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="subtle"
              size="sm"
              className="rounded-full px-5"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-full px-5"
              disabled={!draft.trim()}
              onClick={sendEdit}
            >
              Send
            </Button>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex w-fit min-w-0 max-w-[80%] flex-col gap-1.5",
            "rounded-[18px] px-4 py-2.5",
            "border border-message-user-border",
            "bg-message-user-surface bg-(image:--message-user-glow)",
            "text-message-user-fg shadow-(--message-user-shadow)",
          )}
        >
          {mentions && mentions.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {mentions.map((name) => (
                <span
                  key={name}
                  className="flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-message-user-fg text-xs"
                >
                  <AgentAvatar name={name} size="sm" className="size-4" />
                  {name}
                </span>
              ))}
            </div>
          )}
          {text && (
            <div
              className={cn(
                "whitespace-pre-wrap text-[0.9375rem] leading-relaxed",
                clamped && "line-clamp-2",
              )}
            >
              {text}
            </div>
          )}
          {(clamped || expanded) && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mr-auto rounded text-message-user-fg-muted text-xs transition-colors hover:text-message-user-fg"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}

      {!editing && (
        <div className="absolute top-full right-0 z-10 mt-0.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
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
          {(onResend || onEdit) && (
            <ActionButton label="Edit & re-send" onClick={startEditing}>
              <PencilIcon className="size-3.5" />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * One attachment: the image, a skeleton while its bytes are still coming, or
 * a plain "no longer available" when the engine's copy is gone — a resumed
 * conversation can outlive the files it referenced, and a broken image icon
 * says nothing about why.
 */
function Thumbnail({
  image,
  onView,
}: {
  image: ChatImageAttachment;
  onView?: (image: ChatImageAttachment) => void;
}) {
  if (image.previewUrl) {
    return (
      <button
        type="button"
        title="View image"
        aria-label="View image"
        onClick={() => onView?.(image)}
        className="block w-full overflow-hidden rounded-2xl"
      >
        <img src={image.previewUrl} alt="" className="h-36 w-full object-cover" />
      </button>
    );
  }

  if (image.unavailable) {
    return (
      <div
        title={image.path}
        className="flex h-36 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-border/60 border-dashed bg-agent-surface-inset px-3"
      >
        <ImageOffIcon className="size-5 text-agent-text-faint" />
        <p className="text-center text-agent-text-faint text-xs">
          Image no longer available
        </p>
      </div>
    );
  }

  return (
    <div className="h-36 w-full animate-pulse rounded-2xl bg-agent-surface-inset" />
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
