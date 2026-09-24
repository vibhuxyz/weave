import type { SkillView } from "../types";
import { MAX_EMPLOYEE_BADGES } from "./constants";

interface EmployeeBadgesProps {
  readonly employees: SkillView["usedBy"];
  readonly onOpenEmployee: (employeeId: string) => void;
}

export function EmployeeBadges({ employees, onOpenEmployee }: EmployeeBadgesProps) {
  if (employees.length === 0) return <p className="text-muted-foreground text-xs">No employee lists this skill.</p>;
  const shown = employees.slice(0, MAX_EMPLOYEE_BADGES);
  const hidden = employees.length - shown.length;
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Employees that use this skill">
      {shown.map((employee) => (
        <li key={employee.id}>
          <button
            type="button"
            onClick={() => onOpenEmployee(employee.id)}
            className="rounded-full bg-primary/10 px-2.5 py-0.5 text-foreground text-xs transition-colors hover:bg-primary/20"
          >
            {employee.name}
          </button>
        </li>
      ))}
      {hidden > 0 && <li className="text-muted-foreground text-xs">(+{hidden} more)</li>}
    </ul>
  );
}
