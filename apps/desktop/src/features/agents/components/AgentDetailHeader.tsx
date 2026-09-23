import {
  ChevronLeftIcon,
  CopyIcon,
  MessageCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui";
import { cn } from "@/shared/lib";

const HEADER_BUTTON =
  "inline-flex h-10 items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface AgentDetailHeaderProps {
  name: string;
  isPinned: boolean;
  onBack: () => void;
  onChat: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onReset?: () => void;
}

export function AgentDetailHeader(props: AgentDetailHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={props.onBack}
          aria-label="Back to agents"
          className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <h1 className="truncate text-xl font-medium text-foreground">{props.name}</h1>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className={HEADER_BUTTON} onClick={props.onChat}>
          <MessageCircleIcon className="size-4" />
          Start chat
        </button>
        <button type="button" className={HEADER_BUTTON} onClick={props.onEdit}>
          <PencilIcon className="size-4" />
          Edit
        </button>
        <button type="button" className={HEADER_BUTTON} onClick={props.onTogglePin}>
          {props.isPinned ? <PinOffIcon className="size-4" /> : <PinIcon className="size-4" />}
          {props.isPinned ? "Unpin from home" : "Pin to home"}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="More actions" className={cn(HEADER_BUTTON, "w-10 justify-center px-0")}>
              <MoreHorizontalIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={props.onDuplicate}>
              <CopyIcon className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            {props.onReset && (
              <DropdownMenuItem onClick={props.onReset}>
                <RotateCcwIcon className="size-3.5" />
                Reset to default
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={props.onDelete}>
              <Trash2Icon className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
