import { ENGINES } from "@weave/agent/browser";
import { BUILTIN_EMPLOYEE_SUMMARIES } from "@weave/core/browser";
import type { VerificationRung } from "@weave/protocol";
import { linesOf } from "@/features/employees";

export interface Choice {
  readonly value: string;
  readonly label: string;
}

export interface InstructionPreset {
  readonly id: string;
  readonly label: string;
  readonly body: string;
}

export interface RolePatch {
  readonly description: string;
  readonly responsibilities: string;
  readonly skills: string;
  readonly rules: string;
  readonly instructions: string;
  readonly writePaths: string;
  readonly canDeploy: boolean;
  readonly canUseNetwork: boolean;
  readonly canCommit: boolean;
  readonly requiredRungs: readonly VerificationRung[];
  readonly preferredRungs: readonly VerificationRung[];
}

interface RolePolicy {
  readonly writePaths: readonly string[];
  readonly canUseNetwork: boolean;
  readonly preferredRungs: readonly VerificationRung[];
}

const WHOLE_PROJECT = ["**/*"] as const;

const EXTRA_INSTRUCTION_PRESETS: readonly InstructionPreset[] = [
  {
    id: "explain-only",
    label: "Explain only",
    body: "# Instructions\n\nExplain the cause and the options. Do not edit files unless the task says to.",
  },
  {
    id: "smallest-change",
    label: "Smallest change",
    body: "# Instructions\n\nMake the smallest change that fixes the task. Do not refactor nearby code.",
  },
];

const ROLE_POLICY: Readonly<Record<string, RolePolicy>> = {
  "backend-engineer": { writePaths: WHOLE_PROJECT, canUseNetwork: true, preferredRungs: ["typecheck", "tests"] },
  "frontend-engineer": { writePaths: WHOLE_PROJECT, canUseNetwork: true, preferredRungs: ["typecheck", "build"] },
  "devops-engineer": {
    writePaths: [".github/**", ".gitlab-ci.yml", "**/Dockerfile", "**/docker-compose*.yml", "infra/**", "deploy/**", "k8s/**", "terraform/**", "scripts/**"],
    canUseNetwork: true,
    preferredRungs: ["build"],
  },
  "qa-engineer": {
    writePaths: ["**/*.test.*", "**/*.spec.*", "**/test/**", "**/tests/**", "**/__tests__/**", "e2e/**", "**/fixtures/**"],
    canUseNetwork: true,
    preferredRungs: ["tests"],
  },
  "security-engineer": { writePaths: WHOLE_PROJECT, canUseNetwork: false, preferredRungs: ["typecheck", "tests"] },
  "database-engineer": {
    writePaths: ["**/migrations/**", "**/prisma/**", "**/drizzle/**", "db/**", "**/*.sql", "**/schema.*", "**/*.repo.ts"],
    canUseNetwork: true,
    preferredRungs: ["typecheck", "tests"],
  },
};

function choicesFrom(lines: readonly string[]): readonly Choice[] {
  return [...new Set(lines)].map((line) => ({ value: line, label: line }));
}

export const RESPONSIBILITY_CHOICES = choicesFrom(
  BUILTIN_EMPLOYEE_SUMMARIES.flatMap((role) => [...role.responsibilities]),
);

export const RULE_CHOICES = choicesFrom(BUILTIN_EMPLOYEE_SUMMARIES.flatMap((role) => [...role.rules]));

export const PATH_CHOICES: readonly Choice[] = [
  { value: "**/*", label: "Whole project" },
  { value: "src/**", label: "Source" },
  { value: "apps/**", label: "Apps" },
  { value: "packages/**", label: "Packages" },
  { value: "**/*.{tsx,jsx,css}", label: "UI files" },
  { value: "**/*.test.*", label: "Test files" },
  { value: "**/*.spec.*", label: "Spec files" },
  { value: "**/test/**", label: "Test folders" },
  { value: "**/tests/**", label: "Tests folders" },
  { value: "**/__tests__/**", label: "Unit test folders" },
  { value: "e2e/**", label: "End-to-end" },
  { value: "**/fixtures/**", label: "Fixtures" },
  { value: "docs/**", label: "Docs" },
  { value: ".github/**", label: "GitHub workflows" },
  { value: ".gitlab-ci.yml", label: "GitLab CI" },
  { value: "**/Dockerfile", label: "Dockerfiles" },
  { value: "**/docker-compose*.yml", label: "Compose files" },
  { value: "infra/**", label: "Infrastructure" },
  { value: "deploy/**", label: "Deploy config" },
  { value: "k8s/**", label: "Kubernetes" },
  { value: "terraform/**", label: "Terraform" },
  { value: "scripts/**", label: "Scripts" },
  { value: "**/migrations/**", label: "Migrations" },
  { value: "**/prisma/**", label: "Prisma" },
  { value: "**/drizzle/**", label: "Drizzle" },
  { value: "db/**", label: "Database folder" },
  { value: "**/*.sql", label: "SQL" },
  { value: "**/schema.*", label: "Schema files" },
  { value: "**/*.repo.ts", label: "Repositories" },
];

export const CAPABILITY_CHOICES: readonly Choice[] = [
  { value: "browser", label: "Browser" },
  { value: "computerUse", label: "Computer use" },
  { value: "fileEditing", label: "File editing" },
  { value: "mcp", label: "MCP" },
  { value: "planning", label: "Planning" },
  { value: "sandbox", label: "Sandbox" },
  { value: "skills", label: "Skills" },
  { value: "streaming", label: "Streaming" },
  { value: "subagents", label: "Subagents" },
  { value: "toolCalls", label: "Tool calls" },
  { value: "permissions", label: "Permissions" },
  { value: "resume", label: "Resume" },
  { value: "handoff", label: "Handoff" },
];

export const ENGINE_CHOICES: readonly Choice[] = Object.values(ENGINES).map((engine) => ({
  value: engine.id,
  label: engine.label,
}));

export const ROLE_OPTIONS: readonly Choice[] = BUILTIN_EMPLOYEE_SUMMARIES.map((role) => ({
  value: role.id,
  label: role.name,
}));

export const MEMORY_ENTRY_PRESETS = [50, 100, 200, 500, 1_000, 5_000] as const;
export const MEMORY_RECALL_PRESETS = [4, 8, 12, 16, 24, 50] as const;

export const INSTRUCTION_PRESETS: readonly InstructionPreset[] = [
  ...BUILTIN_EMPLOYEE_SUMMARIES.map((role) => ({ id: role.id, label: role.name, body: role.instructions })),
  ...EXTRA_INSTRUCTION_PRESETS,
];

export const CUSTOM_INSTRUCTIONS_ID = "custom";

export function rolePatch(id: string): RolePatch | null {
  const role = BUILTIN_EMPLOYEE_SUMMARIES.find((item) => item.id === id);
  const policy = ROLE_POLICY[id];
  if (!role || !policy) return null;
  return {
    description: role.description,
    responsibilities: role.responsibilities.join("\n"),
    skills: role.skills.join("\n"),
    rules: role.rules.join("\n"),
    instructions: role.instructions,
    writePaths: policy.writePaths.join("\n"),
    canDeploy: false,
    canUseNetwork: policy.canUseNetwork,
    canCommit: false,
    requiredRungs: [],
    preferredRungs: policy.preferredRungs,
  };
}

export function toggleLine(text: string, line: string): string {
  const selected = linesOf(text);
  if (selected.includes(line)) return selected.filter((item) => item !== line).join("\n");
  return [...selected, line].join("\n");
}

export function optionsWithExtras(options: readonly Choice[], text: string): readonly Choice[] {
  const known = new Set(options.map((option) => option.value));
  const extras = linesOf(text)
    .filter((line) => !known.has(line))
    .sort()
    .map((line) => ({ value: line, label: line }));
  return [...options, ...extras];
}

const SUMMARY_NAME_LIMIT = 2;

export function selectionSummary(options: readonly Choice[], selected: readonly string[], placeholder: string): { readonly label: string; readonly isEmpty: boolean } {
  if (selected.length === 0) return { label: placeholder, isEmpty: true };
  const labelsByValue = new Map(options.map((option) => [option.value, option.label]));
  const labels = selected.map((value) => labelsByValue.get(value) ?? value);
  if (labels.length <= SUMMARY_NAME_LIMIT) return { label: labels.join(", "), isEmpty: false };
  return { label: `${String(labels.length)} selected`, isEmpty: false };
}

export function withCurrentCount(presets: readonly number[], current: number, max: number): readonly number[] {
  const values = presets.filter((value) => value >= 0 && value <= max);
  if (!Number.isFinite(current) || current < 0 || current > max || values.includes(current)) return values;
  return [...values, current].sort((left, right) => left - right);
}

export function instructionPresetId(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed === "") return null;
  return INSTRUCTION_PRESETS.find((preset) => preset.body.trim() === trimmed)?.id ?? null;
}
