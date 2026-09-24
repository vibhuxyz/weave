import type { Employee } from "../model/index.ts";

const INDENT = "  ";

function scalar(value: string): string {
  return JSON.stringify(value);
}

function list(key: string, items: readonly string[], depth: number): readonly string[] {
  const pad = INDENT.repeat(depth);
  if (items.length === 0) return [`${pad}${key}: []`];
  return [`${pad}${key}:`, ...items.map((item) => `${pad}${INDENT}- ${scalar(item)}`)];
}

function block(key: string, text: string): readonly string[] {
  const trimmed = text.replace(/\s+$/, "");
  if (trimmed === "") return [];
  return [`${key}: |-`, ...trimmed.split(/\r?\n/).map((line) => (line === "" ? "" : `${INDENT}${line}`))];
}

export function employeeToYaml(employee: Employee): string {
  const { permissions, engines, verification, memory } = employee;
  const lines = [
    `id: ${employee.id}`,
    `name: ${scalar(employee.name)}`,
    ...(employee.description ? [`description: ${scalar(employee.description)}`] : []),
    ...list("responsibilities", employee.responsibilities, 0),
    ...list("skills", employee.skills, 0),
    ...list("rules", employee.rules, 0),
    ...block("instructions", employee.instructions),
    "permissions:",
    `${INDENT}filesystem:`,
    ...list("read", permissions.filesystem.read, 2),
    ...list("write", permissions.filesystem.write, 2),
    `${INDENT}deployment:`,
    `${INDENT}${INDENT}allowed: ${permissions.deployment.allowed}`,
    `${INDENT}network:`,
    `${INDENT}${INDENT}allowed: ${permissions.network.allowed}`,
    `${INDENT}git:`,
    `${INDENT}${INDENT}commit: ${permissions.git.commit}`,
    ...list("capabilities", employee.capabilities, 0),
    "engines:",
    ...list("preferred", engines.preferred, 1),
    ...(engines.allowed === null ? [] : list("allowed", engines.allowed, 1)),
    "verification:",
    ...list("required", verification.required, 1),
    ...list("preferred", verification.preferred, 1),
    "memory:",
    `${INDENT}enabled: ${memory.enabled}`,
    `${INDENT}maxEntries: ${memory.maxEntries}`,
    `${INDENT}recallCount: ${memory.recallCount}`,
  ];
  return `${lines.join("\n")}\n`;
}
