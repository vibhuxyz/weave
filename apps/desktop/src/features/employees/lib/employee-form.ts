import { DEFAULT_MEMORY, DEFAULT_PERMISSIONS } from "@weave/core/browser";
import type { VerificationRung } from "@weave/protocol";
import type { Employee } from "../types";

export interface EmployeeFormValues {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly responsibilities: string;
  readonly skills: string;
  readonly rules: string;
  readonly capabilities: string;
  readonly instructions: string;
  readonly readPaths: string;
  readonly writePaths: string;
  readonly canDeploy: boolean;
  readonly canUseNetwork: boolean;
  readonly canCommit: boolean;
  readonly preferredEngines: string;
  readonly isEngineListRestricted: boolean;
  readonly allowedEngines: string;
  readonly requiredRungs: readonly VerificationRung[];
  readonly preferredRungs: readonly VerificationRung[];
  readonly isMemoryEnabled: boolean;
  readonly memoryMaxEntries: number;
  readonly memoryRecallCount: number;
}

const COPY_ID_SUFFIX = "-copy";
const COPY_NAME_SUFFIX = " copy";

export function linesOf(text: string): readonly string[] {
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== ""))];
}

function textOf(lines: readonly string[]): string {
  return lines.join("\n");
}

export function idFromName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^[^a-z]+|-+$/g, "");
}

export function emptyFormValues(): EmployeeFormValues {
  return {
    id: "", name: "", description: "", responsibilities: "", skills: "", rules: "", capabilities: "", instructions: "",
    readPaths: textOf(DEFAULT_PERMISSIONS.filesystem.read),
    writePaths: textOf(DEFAULT_PERMISSIONS.filesystem.write),
    canDeploy: DEFAULT_PERMISSIONS.deployment.allowed,
    canUseNetwork: DEFAULT_PERMISSIONS.network.allowed,
    canCommit: DEFAULT_PERMISSIONS.git.commit,
    preferredEngines: "", isEngineListRestricted: false, allowedEngines: "",
    requiredRungs: [], preferredRungs: [],
    isMemoryEnabled: DEFAULT_MEMORY.enabled,
    memoryMaxEntries: DEFAULT_MEMORY.maxEntries,
    memoryRecallCount: DEFAULT_MEMORY.recallCount,
  };
}

export function toFormValues(employee: Employee): EmployeeFormValues {
  const { filesystem, deployment, network, git } = employee.permissions;
  return {
    id: employee.id,
    name: employee.name,
    description: employee.description,
    responsibilities: textOf(employee.responsibilities),
    skills: textOf(employee.skills),
    rules: textOf(employee.rules),
    capabilities: textOf(employee.capabilities),
    instructions: employee.instructions,
    readPaths: textOf(filesystem.read),
    writePaths: textOf(filesystem.write),
    canDeploy: deployment.allowed,
    canUseNetwork: network.allowed,
    canCommit: git.commit,
    preferredEngines: textOf(employee.engines.preferred),
    isEngineListRestricted: employee.engines.allowed !== null,
    allowedEngines: textOf(employee.engines.allowed ?? []),
    requiredRungs: employee.verification.required,
    preferredRungs: employee.verification.preferred,
    isMemoryEnabled: employee.memory.enabled,
    memoryMaxEntries: employee.memory.maxEntries,
    memoryRecallCount: employee.memory.recallCount,
  };
}

export function copyFormValues(employee: Employee): EmployeeFormValues {
  return { ...toFormValues(employee), id: `${employee.id}${COPY_ID_SUFFIX}`, name: `${employee.name}${COPY_NAME_SUFFIX}` };
}

export function toEmployeeFields(values: EmployeeFormValues): Readonly<Record<string, unknown>> {
  const preferred = linesOf(values.preferredEngines);
  const description = values.description.trim();
  const instructions = values.instructions.trim();
  return {
    id: values.id.trim(),
    name: values.name.trim(),
    ...(description ? { description } : {}),
    responsibilities: linesOf(values.responsibilities),
    skills: linesOf(values.skills),
    rules: linesOf(values.rules),
    capabilities: linesOf(values.capabilities),
    ...(instructions ? { instructions } : {}),
    permissions: {
      filesystem: { read: linesOf(values.readPaths), write: linesOf(values.writePaths) },
      deployment: { allowed: values.canDeploy },
      network: { allowed: values.canUseNetwork },
      git: { commit: values.canCommit },
    },
    engines: values.isEngineListRestricted ? { preferred, allowed: linesOf(values.allowedEngines) } : { preferred },
    verification: {
      required: values.requiredRungs,
      preferred: values.preferredRungs.filter((rung) => !values.requiredRungs.includes(rung)),
    },
    memory: { enabled: values.isMemoryEnabled, maxEntries: values.memoryMaxEntries, recallCount: values.memoryRecallCount },
  };
}
