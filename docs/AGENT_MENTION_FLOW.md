# How `@` reaches the engine

Current behavior. The product model is [PRODUCT](PRODUCT.md). This file is only the path from a mention to the system prompt.

The old Berd note that described Goose, `~/.agents/agents/*.md`, a provider, and a model on the persona is not how Weave works. Personas do not store a provider or a model.

## What `@` selects

`@` can name a persona or an employee. That adds the agent's id to the set of agents for this prompt. It does not by itself switch the engine. The engine is the one selected for the chat.

`@` followed by a path asks the server for project files and inserts the project-relative path as text.

Picking a mention records it on the user message so the bubble can show who was named. The mention text is not a second copy of the instructions.

## Who is active

`activeAgents` in `apps/desktop/src/features/agents/hooks/useAgents/personaPrompt.ts` keeps:

1. Every project agent whose mode is `always`.
2. Ids passed in for this prompt. Those are the manual toggles and the `@` mentions.

The same list is what the turn header is allowed to show. The badge cannot name someone the engine was not given.

## The persona block

`formatPersonaSystemPrompt` drops agents with empty instructions. With nobody left, it returns nothing and the server omits the block.

Otherwise it writes `<active-persona>` … `</active-persona>`. Inside, each active agent is a heading plus that agent's `instructions`. The text tells the engine to adopt those instructions as its system prompt and to answer as those people, not to delegate to another agent.

The character image is not in this block.

The desktop server adds the skills catalog beside this block. Discovered `SKILL.md` files become `<available-skills>`. Marketplace plugins attached as Always, plus Manual ones turned on for the chat, are plugin refs on the prompt. They are not inside `<active-persona>`. Old pasted notes under `localStorage` key `berd:skill-plugins`, when any remain, are wrapped in `<enabled-plugins>` and joined to the persona string before send.

## Where the records are

Personas and employees are one `Agent` list from `useAgents`. Personas the user saved are under `localStorage` key `berd:agents`. Built-in personas are `BUILTIN_PERSONAS`. Employees come from the project registry described in [EMPLOYEES](EMPLOYEES.md).

A project stores which of those agents are Always or Manual on the project entry (`agents: { id, mode }`). That list is not a second copy of the instructions.
