import type { ReactNode } from "react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui";
import { menuLabel, type MenuAction } from "@/features/agents/lib";

interface ActionMenuProps {
  readonly actions: readonly MenuAction[];
  readonly isPinned: boolean;
  readonly label: string;
  readonly onAction: (action: MenuAction) => void;
  readonly trigger: (props: { readonly "aria-label": string }) => ReactNode;
}

const DESTRUCTIVE: ReadonlySet<MenuAction> = new Set(["delete", "reset"]);

export function ActionMenu({ actions, isPinned, label, onAction, trigger }: ActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger({ "aria-label": label })}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {actions.map((action) => (
          <DropdownMenuItem
            key={action}
            variant={DESTRUCTIVE.has(action) ? "destructive" : "default"}
            onClick={() => onAction(action)}
          >
            {menuLabel(action, { isPinned })}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

