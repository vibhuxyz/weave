import { ArchiveIcon, MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui";

export interface ProjectOptionsMenuProps {
  label: string;
  isOnHome: boolean;
  onToggleHome: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

export function ProjectOptionsMenu({ label, isOnHome, onToggleHome, onEdit, onArchive }: ProjectOptionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label} options`}
          className="flex size-6 items-center justify-center rounded-md text-sidebar-text-tertiary transition-colors duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontalIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6}>
        <DropdownMenuItem onClick={onToggleHome}>
          {isOnHome ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />}
          {isOnHome ? "Remove from Home" : "Add to Home"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon className="size-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onArchive}>
          <ArchiveIcon className="size-3.5" />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
