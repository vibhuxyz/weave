import { capBytes, escapeClosingTag, flatten } from "../../shared/index.ts";
import type { Employee } from "../model/index.ts";
import { isUnrestricted } from "../resolver/index.ts";

export const MAX_EMPLOYEE_BRIEF_BYTES = 8_000;
const MAX_INSTRUCTIONS_BYTES = 4_000;
const EMPLOYEE_TAG = "employee";
const INSTRUCTIONS_TAG = "employee-instructions";

export interface SkillHint {
  readonly name: string;
  readonly description: string;
}

function bullets(title: string, items: readonly string[]): readonly string[] {
  return items.length === 0 ? [] : [`${title}:`, ...items.map((item) => `- ${flatten(item)}`)];
}

function permissionLines(employee: Employee): readonly string[] {
  const { filesystem, deployment, network, git } = employee.permissions;
  return [
    "Permissions (enforced by Weave, not by you):",
    `- write: ${isUnrestricted(filesystem.write) ? "anywhere your task allows" : filesystem.write.join(", ")}`,
    `- read: ${filesystem.read.join(", ")}`,
    `- deployment: ${deployment.allowed ? "allowed" : "not allowed; prepare it and report instead"}`,
    `- network: ${network.allowed ? "allowed" : "not allowed"}`,
    `- git commit: ${git.commit ? "allowed" : "not allowed; Weave commits your work"}`,
  ];
}

function verificationLines(employee: Employee): readonly string[] {
  const { required, preferred } = employee.verification;
  if (required.length + preferred.length === 0) return [];
  return [
    "Verification before your work can merge:",
    ...(required.length > 0 ? [`- must pass: ${required.join(", ")}`] : []),
    ...(preferred.length > 0 ? [`- must pass when the project has them: ${preferred.join(", ")}`] : []),
  ];
}

export function renderEmployeeBrief(employee: Employee, skills: readonly SkillHint[]): string {
  const instructions = employee.instructions.trim()
    ? [`<${INSTRUCTIONS_TAG}>`, escapeClosingTag(capBytes(employee.instructions.trim(), MAX_INSTRUCTIONS_BYTES), INSTRUCTIONS_TAG), `</${INSTRUCTIONS_TAG}>`]
    : [];
  const body = [
    `You are ${flatten(employee.name)} (${employee.id}) on this team.${employee.description ? ` ${flatten(employee.description)}` : ""}`,
    ...bullets("Responsibilities", employee.responsibilities),
    ...bullets("Skills", skills.map((skill) => (skill.description ? `${skill.name}: ${skill.description}` : skill.name))),
    ...bullets("Rules", employee.rules),
    ...permissionLines(employee),
    ...verificationLines(employee),
    ...instructions,
  ].join("\n");
  const safe = escapeClosingTag(body, EMPLOYEE_TAG);
  const open = `<${EMPLOYEE_TAG} id="${employee.id}" source="${employee.source}">`;
  const close = `</${EMPLOYEE_TAG}>`;
  const budget = MAX_EMPLOYEE_BRIEF_BYTES - Buffer.byteLength(`${open}\n\n${close}`, "utf8");
  return [open, capBytes(safe, budget), close].join("\n");
}
