import { SkillLibrary } from "./SkillLibrary";

export function SkillsView({
  hasProject,
  onOpenEmployee,
  onRefreshSkills,
}: {
  readonly hasProject: boolean;
  readonly onOpenEmployee: (employeeId: string) => void;
  readonly onRefreshSkills: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-8">
      <h1 className="mb-1 font-medium text-lg text-foreground">Skills</h1>
      <p className="mb-6 max-w-2xl text-muted-foreground text-sm">
        How-tos such as React or TypeScript. Add a folder with a SKILL.md under .agents/skills, then choose it when you create an employee. Plugins are separate: install those from the Plugins page.
      </p>
      <SkillLibrary hasProject={hasProject} onOpenEmployee={onOpenEmployee} onRefresh={onRefreshSkills} />
    </div>
  );
}
