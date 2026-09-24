import type { EmployeeActions } from "@/features/employees";
import { useEmployeesPage, type Agent } from "@/features/agents/hooks";
import { ConfirmDialog } from "@/shared/ui";
import { EmployeeDialog } from "../employee-dialog";
import { EmployeeDetailView } from "../employee-detail";
import { EmployeeGrid } from "./EmployeeGrid";
import { ListingNotice } from "./ListingNotice";
import { removalCopyFor } from "./removal-copy";

interface EmployeesViewProps {
  readonly actions: EmployeeActions;
  readonly hasProject: boolean;
  readonly onChat: (agent: Agent, message?: string) => void;
  readonly focusEmployeeId: string | null;
  readonly onFocusHandled: () => void;
}

export function EmployeesView({ actions, hasProject, onChat, focusEmployeeId, onFocusHandled }: EmployeesViewProps) {
  const page = useEmployeesPage({ actions, onChat, focusEmployeeId, onFocusHandled });
  const { pendingRemoval, viewing } = page;
  const removalCopy = pendingRemoval ? removalCopyFor(pendingRemoval) : null;

  return (
    <>
      {viewing?.entry ? (
        <EmployeeDetailView
          agent={viewing.agent}
          entry={viewing.entry}
          isPinned={page.isPinned(viewing.agent.id)}
          readEmployee={actions.readEmployee}
          onBack={page.closeViewing}
          onAction={page.handleAction}
          onChat={onChat}
        />
      ) : (
        <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-8">
          <header className="mb-8">
            <h1 className="font-medium text-lg text-foreground">Employees</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Who Weave assigns work to: their responsibilities, permissions, engines and checks.
            </p>
          </header>
          {page.actionError && (
            <div role="alert" className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-destructive/40 px-4 py-3 text-sm text-destructive">
              <p className="break-words">{page.actionError}</p>
              <button type="button" className="shrink-0 text-xs underline" onClick={page.dismissError}>Dismiss</button>
            </div>
          )}
          <ListingNotice listing={page.listing} hasProject={hasProject} />
          <EmployeeGrid
            agents={page.agents}
            entriesById={page.entriesById}
            isPinned={page.isPinned}
            canCreate={page.listing.status === "ready"}
            onCreate={page.openCreate}
            onAction={page.handleAction}
          />
        </div>
      )}
      {page.dialog && (
        <EmployeeDialog state={page.dialog} saveEmployee={actions.saveEmployee} onClose={page.closeDialog} onSaved={page.handleSaved} />
      )}
      {pendingRemoval && removalCopy && (
        <ConfirmDialog
          open
          onOpenChange={(isOpen) => { if (!isOpen) page.cancelRemoval(); }}
          title={removalCopy.title}
          description={removalCopy.description}
          cancelLabel="Cancel"
          confirmLabel={removalCopy.confirm}
          loadingLabel="Working…"
          isLoading={page.isRemoving}
          onConfirm={() => page.confirmRemoval(pendingRemoval)}
        />
      )}
    </>
  );
}
