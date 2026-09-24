import { ArchiveIcon, MoreHorizontalIcon, PencilIcon, PinIcon, PinOffIcon } from "lucide-react";
import {
  ContextMenuContent,
  ContextMenuItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui";

export interface ProjectMenuActions {
  isOnHome: boolean;
  onToggleHome: () => void;
  onEdit: () => void;
  onArchive: () => void;
}

export interface ProjectOptionsMenuProps extends ProjectMenuActions {
  label: string;
}

function menuEntries({ isOnHome, onToggleHome, onEdit, onArchive }: ProjectMenuActions) {
  return [
    {
      key: "home",
      icon: isOnHome ? <PinOffIcon className="size-3.5" /> : <PinIcon className="size-3.5" />,
      label: isOnHome ? "Remove from Home" : "Add to Home",
      onSelect: onToggleHome,
    },
    { key: "edit", icon: <PencilIcon className="size-3.5" />, label: "Edit", onSelect: onEdit },
    { key: "archive", icon: <ArchiveIcon className="size-3.5" />, label: "Archive", onSelect: onArchive },
  ];
}

export function ProjectOptionsMenu({ label, ...actions }: ProjectOptionsMenuProps) {
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
        {menuEntries(actions).map((entry) => (
          <DropdownMenuItem key={entry.key} onClick={entry.onSelect}>
            {entry.icon}
            {entry.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProjectContextMenuContent(actions: ProjectMenuActions) {
  return (
    <ContextMenuContent>
      {menuEntries(actions).map((entry) => (
        <ContextMenuItem key={entry.key} onClick={entry.onSelect}>
          {entry.icon}
          {entry.label}
        </ContextMenuItem>
      ))}
    </ContextMenuContent>
  );
}
