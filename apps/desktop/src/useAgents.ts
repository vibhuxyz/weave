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
  /** Custom avatar as a data URI; overrides the character art. */
  icon?: string;
  /** A bundled character the user picked, by key (see `characters.ts`). */
  character?: string;
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

  // Built-ins the user deleted. They live in code, so the only way to keep one
  // gone across reloads is to remember that it was.
  const [removedBuiltins, setRemovedBuiltins] = usePersistedState<string[]>(
    "berd:agents:removed",
    [],
    (value, defaults) =>
      Array.isArray(value) ? value.filter((v) => typeof v === "string") : defaults,
  );

  const agents = useMemo(() => {
    // An edited built-in is stored like any other agent, under the same id;
    // the stored copy then stands in for the one in code.
    const overrides = new Map(
      stored.filter((a) => a.builtin).map((a) => [a.id, a]),
    );
    const builtins = BUILTINS.filter((b) => !removedBuiltins.includes(b.id)).map(
      (b) => overrides.get(b.id) ?? b,
    );
    // Built-ins first, then user agents (newest first — stored unshift order).
    const custom = stored.filter((a) => !a.builtin);
    return [...builtins, ...custom];
  }, [stored, removedBuiltins]);

  const create = useCallback(
    (draft: AgentDraft): Agent => {
      const agent: Agent = {
        ...draft,
        id: `agent:${crypto.randomUUID()}`,
        builtin: false,
        createdAt: now(),
        updatedAt: now(),
      };
      setStored((cur) => [agent, ...cur]);
      return agent;
    },
    [setStored],
  );

  const update = useCallback(
    (id: string, patch: Partial<AgentDraft>) => {
      setStored((cur) => {
        if (cur.some((a) => a.id === id)) {
          return cur.map((a) =>
            a.id === id ? { ...a, ...patch, updatedAt: now() } : a,
          );
        }
        // First edit of a built-in: store a full copy to override the one in
        // code, keeping `builtin` so it still sorts and resets as a built-in.
        const builtin = BUILTINS.find((b) => b.id === id);
        if (!builtin) return cur;
        return [...cur, { ...builtin, ...patch, updatedAt: now() }];
      });
    },
    [setStored],
  );

  const remove = useCallback(
    (id: string) => {
      setStored((cur) => cur.filter((a) => a.id !== id));
      if (BUILTINS.some((b) => b.id === id)) {
        setRemovedBuiltins((cur) => (cur.includes(id) ? cur : [...cur, id]));
      }
    },
    [setStored, setRemovedBuiltins],
  );

  /**
   * Put a built-in back the way it ships — undoes both an edit and a delete.
   * Without it a built-in overwritten by mistake is gone for good.
   */
  const resetBuiltin = useCallback(
    (id: string) => {
      setStored((cur) => cur.filter((a) => !(a.id === id && a.builtin)));
      setRemovedBuiltins((cur) => cur.filter((v) => v !== id));
    },
    [setStored, setRemovedBuiltins],
  );

  /** True when this built-in has been edited or deleted by the user. */
  const isBuiltinModified = useCallback(
    (id: string) =>
      removedBuiltins.includes(id) ||
      stored.some((a) => a.id === id && a.builtin),
    [removedBuiltins, stored],
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
        character: src.character,
      });
    },
    [agents, create],
  );

  return {
    agents,
    create,
    update,
    remove,
    duplicate,
    resetBuiltin,
    isBuiltinModified,
  };
}

/**
 * The agents whose instructions ride this prompt: every project agent set to
 * `always`, plus any passed explicitly (manually toggled on, or @-mentioned).
 *
 * Shared by the system prompt and the run card's header, so the badge on a
 * turn can never claim a persona the engine was not actually given.
 */
export function activeAgents(
  projectAgents: ProjectAgent[] | undefined,
  allAgents: Agent[],
  extraIds: string[] = [],
): Agent[] {
  const wanted = new Set<string>(extraIds);
  for (const pa of projectAgents ?? []) {
    if (pa.mode === "always") wanted.add(pa.id);
  }
  return allAgents.filter((a) => wanted.has(a.id));
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
  const active = activeAgents(projectAgents, allAgents, extraIds).filter((a) =>
    a.instructions.trim(),
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
