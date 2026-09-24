import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui";

interface ArchiveRowActionsProps {
  readonly label: string;
  readonly onRestore: () => void;
  readonly onDelete: () => void;
  readonly deleteBlockedReason?: string;
}

export function ArchiveRowActions({ label, onRestore, onDelete, deleteBlockedReason }: ArchiveRowActionsProps) {
  const deleteButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onDelete}
      disabled={deleteBlockedReason !== undefined}
      aria-label={`Delete ${label}`}
      className="text-destructive hover:text-destructive"
    >
      Delete
    </Button>
  );
  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onRestore} aria-label={`Restore ${label}`}>
        Restore
      </Button>
      {deleteBlockedReason === undefined ? (
        deleteButton
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0}>{deleteButton}</span>
          </TooltipTrigger>
          <TooltipContent side="top">{deleteBlockedReason}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
