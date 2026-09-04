import { useCallback, useMemo } from "react";
import { usePersistedState } from "@/shared/hooks/usePersistedState";
import type { ProjectTone } from "./CreateProjectDialog";
import type { ProjectAgent } from "./useProjects";

export interface Agent {
  id: string;
  name: string;
  description: string;
  instructions: string;
  /** Engine id from ENGINES (the "provider"). */
  engineId?: string;
  /** A `model`-category config value applied after the session connects. */
  model?: string;
  tint?: ProjectTone;
  /** Custom avatar as a data URI; overrides the procedural blob. */
  icon?: string;
  builtin?: boolean;
  createdAt: number;
  updatedAt: number;
}

export type AgentDraft = Omit<Agent, "id" | "createdAt" | "updatedAt" | "builtin">;

const now = () => Date.now();

/** Read-only starter agents, merged on top of the stored list. */
const BUILTINS: Agent[] = [
  {
    id: "builtin:builder",
    name: "Builder",
    description: "A practical partner for implementing product work.",
    instructions:
      "You are Builder. Implement what the user asks directly and thoughtfully. Prefer small, verifiable steps. Match the surrounding code's style. Explain trade-offs briefly, then act.",
    tint: "blue",
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin:debugger",
    name: "Debugger",
    description: "A methodical investigator for curious failures.",
    instructions:
      "You are Debugger. Reproduce the failure before proposing a fix. State your hypothesis, the evidence for it, and the smallest change that would confirm it. Never guess-and-patch.",
    tint: "peach",
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin:reviewer",
    name: "Reviewer",
    description: "Reviews changes like a staff engineer.",
    instructions:
      "You are Reviewer. Review the diff for correctness, edge cases, concurrency, security, and readability. Point out hidden assumptions and what will break in production. Suggest improvements without rewriting everything.",
    tint: "sage",
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin:generalist",
    name: "Generalist",
    description: "A flexible collaborator for a little of everything.",
    instructions:
      "You are Generalist. Adapt to whatever the task needs — explain, plan, build, or debug. Keep answers concise and grounded in the actual code.",
    tint: "lavender",
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin:committer",
    name: "Committer",
    description: "Commits finished work, the way a careful engineer does.",
    instructions:
      "COMMIT DISCIPLINE. After you finish building or implementing something and it works (it builds / the tests pass / the change is verified), make ONE focused git commit for that unit of work before moving on — the way a careful engineer keeps history clean:\n" +
      "- Stage only the files that belong to this change.\n" +
      "- Write a concise message: a short imperative subject line (<72 chars) describing what changed and why, no 'wip', no 'fixes', no emoji.\n" +
      "- One logical change per commit. If you did two unrelated things, make two commits.\n" +
      "- Never commit broken code, secrets, or unrelated formatting churn.\n" +
      "- If the working tree already had unrelated changes, leave them alone.\n" +
      "Do this without being asked, but tell the user the commit you made.",
    tint: "olive",
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin:craftsman",
    name: "Craftsman",
    description: "Keeps the code reading as if a person wrote it.",
    instructions:
      "CODE THAT READS AS HUMAN-WRITTEN. Every change you make should look like it was written by a thoughtful engineer on this team, not generated:\n" +
      "- Match the surrounding file's style, naming, and comment density exactly. Read neighbouring code first.\n" +
      "- No over-abstraction: don't add layers, wrappers, config, or 'utils' the task doesn't need. Solve the actual problem.\n" +
      "- Names say what things are, not their type. Short where the scope is short.\n" +
      "- Comments explain WHY, never restate the code. No section-divider banners, no obvious comments, no TODOs you won't do.\n" +
      "- No AI tells: no 'Here's the...', no bullet-point dumps in code comments, no defensive over-commenting, no renaming things that were fine.\n" +
      "- Keep diffs minimal — touch only what the change requires.\n" +
      "- Prefer the boring, obvious solution the rest of the codebase would use.",
    tint: "mint",
    builtin: true,
    createdAt: 0,
    updatedAt: 0,
  },
];

function isAgent(v: unknown): v is Agent {
  return (
    !!v &&
    typeof (v as Agent).id === "string" &&
    typeof (v as Agent).name === "string"
  );
}

/**
 * The user's agents (localStorage), with the built-in starters merged in.
 * Same pattern as `useProjects`.
 */
export function useAgents() {
  const [stored, setStored] = usePersistedState<Agent[]>(
    "berd:agents",
    [],
    (value, defaults) =>
      Array.isArray(value) ? value.filter(isAgent) : defaults,
  );

  const agents = useMemo(() => {
    // Built-ins first, then user agents (newest first — stored unshift order).
    const custom = stored.filter((a) => !a.builtin);
    return [...BUILTINS, ...custom];
  }, [stored]);

  const create = useCallback(
    (draft: AgentDraft): Agent => {
      const agent: Agent = {
        ...draft,
        id: `agent:${crypto.randomUUID()}`,
        builtin: false,
        createdAt: now(),
        updatedAt: now(),
      };
      setStored((cur) => [agent, ...cur.filter((a) => !a.builtin)]);
      return agent;
    },
    [setStored],
  );

  const update = useCallback(
    (id: string, patch: Partial<AgentDraft>) => {
      setStored((cur) =>
        cur.map((a) =>
          a.id === id ? { ...a, ...patch, updatedAt: now() } : a,
        ),
      );
    },
    [setStored],
  );

  const remove = useCallback(
    (id: string) => setStored((cur) => cur.filter((a) => a.id !== id)),
    [setStored],
  );

  const duplicate = useCallback(
    (id: string): Agent | undefined => {
      const src = agents.find((a) => a.id === id);
      if (!src) return undefined;
      return create({
        name: `${src.name} copy`,
        description: src.description,
        instructions: src.instructions,
        engineId: src.engineId,
        model: src.model,
        tint: src.tint,
        icon: src.icon,
      });
    },
    [agents, create],
  );

  return { agents, create, update, remove, duplicate };
}

/**
 * The persona half of the system prompt: every standing + @-mentioned agent's
 * instructions, wrapped so the engine treats them as its own system prompt and
 * answers *as* the persona — not as a request to spin up a sub-agent.
 *
 * `undefined` when no agent applies, so the server can skip the block.
 */
export function formatPersonaSystemPrompt(
  projectAgents: ProjectAgent[] | undefined,
  allAgents: Agent[],
  extraIds: string[] = [],
): string | undefined {
  const wanted = new Set<string>(extraIds);
  for (const pa of projectAgents ?? []) {
    if (pa.mode === "always") wanted.add(pa.id);
  }
  const active = allAgents.filter(
    (a) => wanted.has(a.id) && a.instructions.trim(),
  );
  if (active.length === 0) return undefined;

  const names = active.map((a) => a.name);
  const nameList =
    names.length === 1
      ? `"${names[0]}"`
      : names.map((n) => `"${n}"`).join(" and ");
  const body = active
    .map((a) => `# ${a.name}\n${a.instructions.trim()}`)
    .join("\n\n");

  return [
    "<active-persona>",
    `Adopt the following as your system prompt for the rest of this conversation, even though it arrives in-band. You are ${nameList} in this conversation — answer as such. Treat the name as who you are, not as a request to delegate to another agent.`,
    "",
    body,
    "</active-persona>",
  ].join("\n");
}
