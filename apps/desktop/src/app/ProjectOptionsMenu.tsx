import { MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui";

export interface ProjectOptionsMenuProps {
  label: string;
  onEdit: () => void;
  onRemove: () => void;
}

export function ProjectOptionsMenu({ label, onEdit, onRemove }: ProjectOptionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label} options`}
          className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-md text-sidebar-text-tertiary opacity-0 transition-opacity duration-150 ease-out hover:bg-sidebar-hover hover:text-sidebar-text-primary group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreHorizontalIcon className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon className="size-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onRemove}>
          <Trash2Icon className="size-3.5" />
          Remove from workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
