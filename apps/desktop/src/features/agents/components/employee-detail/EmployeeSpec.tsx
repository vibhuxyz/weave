import type { Employee } from "@/features/employees";
import { MessageResponse } from "@/shared/ui/ai-elements";
import { DetailSection, FactRow, ItemList, TagList } from "./DetailSection";

function allowed(isAllowed: boolean, denied: string): string {
  return isAllowed ? "Allowed" : denied;
}

export function EmployeeSpec({ employee }: { readonly employee: Employee }) {
  const { filesystem, deployment, network, git } = employee.permissions;
  const { required, preferred } = employee.verification;
  return (
    <div className="space-y-6">
      <DetailSection title="Responsibilities">
        <ItemList items={employee.responsibilities} empty="None listed. Tasks reach this employee only when a plan names it." />
      </DetailSection>
      <DetailSection title="Skills">
        <TagList items={employee.skills} empty="No skills." />
      </DetailSection>
      <DetailSection title="Rules">
        <ItemList items={employee.rules} empty="No rules." />
      </DetailSection>
      <DetailSection title="Permissions">
        <dl>
          <FactRow label="Can write">{filesystem.write.join(", ") || "Nowhere"}</FactRow>
          <FactRow label="Can read (not enforced)">{filesystem.read.join(", ") || "Nowhere"}</FactRow>
          <FactRow label="Deployment">{allowed(deployment.allowed, "Blocked")}</FactRow>
          <FactRow label="Network">{allowed(network.allowed, "Blocked")}</FactRow>
          <FactRow label="Git commit">{allowed(git.commit, "Weave commits instead")}</FactRow>
        </dl>
      </DetailSection>
      <DetailSection title="Engines and capabilities">
        <dl>
          <FactRow label="Tried first">{employee.engines.preferred.join(", ") || "No preference"}</FactRow>
          <FactRow label="Allowed">{employee.engines.allowed === null ? "Any configured engine" : employee.engines.allowed.join(", ") || "None"}</FactRow>
          <FactRow label="Needs">{employee.capabilities.join(", ") || "Nothing special"}</FactRow>
        </dl>
      </DetailSection>
      <DetailSection title="Verification before merge">
        <dl>
          <FactRow label="Must pass">{required.join(", ") || "Nothing required"}</FactRow>
          <FactRow label="Must pass if present">{preferred.join(", ") || "Nothing"}</FactRow>
        </dl>
      </DetailSection>
      <DetailSection title="Memory">
        <dl>
          <FactRow label="Remembers work">{employee.memory.enabled ? "Yes" : "No"}</FactRow>
          <FactRow label="Keeps">{employee.memory.maxEntries} entries</FactRow>
          <FactRow label="Recalls per task">{employee.memory.recallCount} entries</FactRow>
        </dl>
      </DetailSection>
      <DetailSection title="Instructions">
        {employee.instructions ? <MessageResponse>{employee.instructions}</MessageResponse> : <p className="text-muted-foreground">No instructions.</p>}
      </DetailSection>
    </div>
  );
}
