# Product

How Weave works today. This file is the product source of truth. Package layout stays in [ARCHITECTURE](ARCHITECTURE.md). The employee file format and team-run assignment stay in [EMPLOYEES](EMPLOYEES.md). `@` mentions stay in [AGENT_MENTION_FLOW](AGENT_MENTION_FLOW.md).

## Four different things

| Thing | Decides | Where it lives |
|---|---|---|
| Persona | How an engine works and replies on a task | This computer, `localStorage` key `berd:agents`, plus four built-ins in code |
| Employee | What the work is, which rules to follow, which skills apply, and what the task is allowed to do | `.weave/employees/*.{yaml,yml,json}` in the open project, else six built-ins |
| Skill | A how-to for one kind of work (React, TypeScript, Postgres) | A directory with `SKILL.md` |
| Plugin | Extra commands, skills, or MCP already installed for Claude | `~/.claude/plugins`, then attached to a project |

An engine (Claude Code, Codex, Grok, and the others) is the process that does the work. A persona does not pick the engine or the model. The chat does.

An avatar is only a picture. It is never written into the system prompt.

## Personas

Built-ins, in this order: Builder, Teacher, Committer, Debugger.

- **Builder** does the task, changes the code, and reports what changed.
- **Teacher** explains. It does not edit unless asked.
- **Committer** writes the commit for this task and does not start new work.
- **Debugger** reproduces the failure and fixes the smallest cause.

A built-in persona's card menu is **Customize** and pin to Home. Customize opens the same side sheet as a new persona. The name stays, so the saved copy replaces that built-in. Description, instructions, and avatar can change. The card then says **Customized**. **Reset to default** deletes that copy and the built-in comes back.

A persona you create has **Edit**, pin, and **Delete**. Delete removes it from this computer. It does not remove a built-in.

The sheet asks for a name, a description, instructions, and an avatar. Description and instructions are required. The avatar is chosen from the collection page in the main canvas (Gloopies, Figgies, Fuzzies), then from that collection's gallery. Figgies is the label for the `pollies-*` art.

Each avatar key belongs to one persona or one employee. A key that is already showing is marked **In use** and cannot be saved onto someone else. The six built-in employees already use the six Gloopies. Builder uses `fuzzies-1`. Opening Customize keeps the picture that persona already shows.

Custom personas are stored under `berd:agents`. A saved copy whose id is `builder`, `teacher`, `committer`, or `debugger` replaces that built-in in the list. A saved persona does not replace an employee with the same id.

## Employees

An employee is configuration, not a class. Identity, responsibilities, skills, rules, instructions, permissions, capabilities, engine policy, verification, and memory are fields on that config. The desktop team run always passes `employees: {}`.

The desktop registry is the open project's `.weave/employees` files, then the six built-ins: `backend-engineer`, `frontend-engineer`, `database-engineer`, `devops-engineer`, `qa-engineer`, `security-engineer`. A project file with the same id replaces the built-in. `extends` copies a built-in and overrides the fields you list. `loadEmployeeRegistry` can also read `employees.userDir`, but the desktop server does not pass that directory.

On the Employees screen, with a project open:

- A built-in or user employee can be customized or duplicated. Customize keeps the id and writes a project file that replaces the original. **Reset to default** deletes that file.
- A project employee can be edited, duplicated, and either reset (if it overrides another employee) or deleted.

The form's skills control is a checklist of discovered `SKILL.md` skills, plus any names already saved on that employee that discovery does not know. It is not a free-text box.

Employees have no avatar picker. A custom employee's picture is a hash of its id, so two custom employees can show the same character. The six built-ins each keep their own Gloopies character, and none of those is Builder's `fuzzies-1`.

Instruction text for the backend, frontend, database, and devops built-ins starts from profiles in `packages/core/src/agents/`. QA and security carry their own text. That folder is not the Personas screen. `ai-engineer` and `reviewer` are profiles there and are not desktop employees.

Chat starts a conversation as that employee and may switch engine. `@` mentions one on the next message. Project agent mode **Always** puts it on every new chat. **Manual** leaves it off until you turn it on for a chat.

What a team run does with the file — assignment score, write scope, verification, memory — is [EMPLOYEES](EMPLOYEES.md). Read permission is shown to the employee and is not enforced. Write, deployment, network, and git commit are enforced.

## Skills

A skill is a directory whose `SKILL.md` starts with frontmatter. `name` and `description` are required. `applies-to` or `appliesTo` is optional.

For a project, discovery walks these directories in order. The first `name` wins:

1. `~/.weave/projects/<project id>/skills`
2. `<project>/.agents/skills`
3. `~/.weave/skills`

A discovered skill whose name matches a built-in skill replaces that built-in. Built-in skill bodies ship in `packages/core/src/builtin-skills/` and are inlined. Discovered skills are a catalog: the prompt lists name, description, and path, and the engine reads `SKILL.md` when the description matches the task.

The Skills screen lists them. It does not have a create-skill dialog.

ACP may read a skill file under these home roots even when the path is outside the task directory: `~/.agents/skills`, `~/.claude/skills`, `~/.codex/skills`, `~/.cursor/skills`, `~/.grok/skills`, `~/.grok/bundled/skills`, `~/.weave/skills`. Writes stay inside the task directory.

## Plugins

Weave does not clone a marketplace. It reads the catalog already installed under `~/.claude/plugins`.

Attach a plugin to the open project as **Always**, **Manual**, or **Off**. Always is included on every new chat in that project. Manual is off until you turn it on for a chat. Off means it is not stored on the project. The chat context panel is where you add or edit that attachment. Those attachments are sent as plugin refs on the prompt.

The sidebar has no Plugins item. A Plugins screen exists in the app and nothing in the shell navigates to it. The Skills page mentions that screen.

Old pasted notes can still sit in `localStorage` under `berd:skill-plugins`. If any remain, their name and description are wrapped in `<enabled-plugins>` and joined to the persona text. The unreachable Plugins screen is what lists them for removal. The Skills and Employees forms do not create new notes.

## Engines

The registry in `packages/agent/src/engines/registry.ts` includes Claude Code, Codex, Grok, Amp, Gemini CLI, OpenCode, and Antigravity.

Grok is engine id `grok`, provider `xai`. The process is `@xai-official/grok` with arguments `agent --no-leader stdio`. Weave looks for a CLI at `GROK_PATH`, then `$GROK_HOME/bin/grok` or `~/.grok/bin/grok`, before the npm package entry. Sign-in is the terminal methods `grok-device-auth` and `grok-login`. Grok sometimes prints a JSON-RPC response with id `skills-reload` and no method. Weave drops that line before the ACP client sees it, and only for this engine.

## What a chat sends

For each prompt, the active agents are:

- every project agent set to **Always**
- agents you turned on manually for this chat
- agents you `@`-mentioned on this message

`formatPersonaSystemPrompt` wraps their instructions in `<active-persona>` and tells the engine to answer as those personas. The avatar is not included. If both an employee and a persona are active, both instruction blocks are included.

The desktop server adds the skills catalog beside that block. Marketplace plugin refs travel on the prompt, not inside `<active-persona>`. Leftover pasted notes, if any, are the `<enabled-plugins>` block joined to the persona string. See [AGENT_MENTION_FLOW](AGENT_MENTION_FLOW.md).

## Desktop navigation

The sidebar is Home, Personas, Employees, Skills, and Project. Settings opens from the shell. Chat is the transcript. Personas and employees share one agent list in memory. The Personas screen shows records whose origin is `persona`. The Employees screen shows records whose origin is `employee`. Plugin attachment is the chat context panel, not a sidebar item.
