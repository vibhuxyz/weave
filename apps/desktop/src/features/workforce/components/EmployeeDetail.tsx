import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/shared/ui";
import { AgentAvatar } from "@/features/agents/components";
import type { EmployeeView } from "../types";
import { Chips, DetailSection, Facts } from "./DetailSection";
import { SourceBadge } from "./SourceBadge";

const yesNo = (value: boolean, yes: string, no: string): string => (value ? yes : no);

export function EmployeeDetail({ employee, agentId, onBack, onChat, onEdit }: {
  readonly employee: EmployeeView;
  readonly agentId: string;
  readonly onBack: () => void;
  readonly onChat: () => void;
  readonly onEdit: () => void;
}) {
  const { permissions, engines, verification, memory, performance } = employee;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 overflow-y-auto p-8">
      <button type="button" onClick={onBack} className="flex w-fit items-center gap-1 text-muted-foreground text-sm hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Employees
      </button>
      <header className="flex items-center gap-5">
        <AgentAvatar name={employee.name} seed={agentId} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-medium text-foreground text-lg">{employee.name}</h1>
            <SourceBadge source={employee.source} />
          </div>
          <p className="font-mono text-muted-foreground text-xs">{employee.id}{employee.sourcePath ? ` · ${employee.sourcePath}` : ""}</p>
          {employee.description && <p className="text-muted-foreground text-sm">{employee.description}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>{employee.source === "project" ? "Edit" : "Customize"}</Button>
          <Button type="button" size="sm" onClick={onChat}>Chat</Button>
        </div>
      </header>
      <DetailSection title="Responsibilities"><Chips items={employee.responsibilities} empty="None listed" /></DetailSection>
      <DetailSection title="Skills"><Chips items={employee.skills} empty="None listed" /></DetailSection>
      {employee.rules.length > 0 && (
        <DetailSection title="Rules">
          <ul className="list-disc space-y-1 pl-5 text-foreground text-sm">{employee.rules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
        </DetailSection>
      )}
      <DetailSection title="Permissions (enforced)">
        <Facts rows={[
          ["May write", permissions.write.join(", ")],
          ["Reads", `${permissions.read.join(", ")} (shown, not enforced)`],
          ["Deployment", yesNo(permissions.deployment, "Allowed", "Blocked")],
          ["Network", yesNo(permissions.network, "Allowed", "Blocked")],
          ["Git commit", yesNo(permissions.gitCommit, "Allowed", "Blocked; Weave commits")],
        ]} />
      </DetailSection>
      <DetailSection title="Engines and capabilities">
        <Facts rows={[
          ["Preferred", engines.preferred.join(", ") || "No preference"],
          ["Allowed", engines.allowed ? engines.allowed.join(", ") : "Any configured engine"],
          ["Needs", employee.capabilities.join(", ") || "File editing and tools"],
        ]} />
      </DetailSection>
      <DetailSection title="Verification before merge">
        <Facts rows={[
          ["Must pass", verification.required.join(", ") || "Nothing required"],
          ["When available", verification.preferred.join(", ") || "Nothing extra"],
        ]} />
      </DetailSection>
      <DetailSection title="Track record and memory">
        <Facts rows={[
          ["Tasks", performance ? `${performance.ok} of ${performance.tasks} finished ok` : "No tasks yet"],
          ["Memory", memory.enabled ? `${memory.entries} entries` : "Off"],
        ]} />
        {memory.recent.length > 0 && (
          <ul className="flex flex-col gap-1.5 text-sm">
            {memory.recent.map((entry) => (
              <li key={`${entry.at}-${entry.taskId}-${entry.text}`} className="text-foreground">
                <span className="mr-2 font-mono text-muted-foreground text-xs">{entry.kind} · {entry.taskId}</span>{entry.text}
              </li>
            ))}
          </ul>
        )}
      </DetailSection>
      {employee.instructions && (
        <DetailSection title="Instructions">
          <pre className="whitespace-pre-wrap rounded-lg border border-border bg-secondary/30 p-3 font-mono text-foreground text-xs leading-relaxed">{employee.instructions}</pre>
        </DetailSection>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">What the engine receives</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-border bg-secondary/30 p-3 font-mono text-foreground text-xs leading-relaxed">{employee.brief}</pre>
      </details>
    </div>
  );
}
