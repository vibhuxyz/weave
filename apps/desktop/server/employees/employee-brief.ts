import { buildSkillRegistry, renderEmployeeBrief, type Employee } from "@weave/core";

export function briefOf(employee: Employee): string {
  const descriptions = new Map(buildSkillRegistry([]).skills.map((skill) => [skill.name, skill.description]));
  const skills = employee.skills.map((name) => ({ name, description: descriptions.get(name) ?? "" }));
  return renderEmployeeBrief(employee, skills);
}
