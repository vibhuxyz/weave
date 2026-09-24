# Employees

Built as Phase 6 (commit `95580cf`).

An employee is a **configuration**, not a class: identity, responsibilities, skills, rules, memory,
permissions, capabilities, engine policy and verification policy. Weave assigns each planned task to
the employee that fits it, runs the task inside that employee's permissions, checks the work against
that employee's verification policy, and remembers what the employee learned.

Code: `packages/core/src/employees/`. Enable it with `planAndRun({ employees: {} })`.

## Where employees come from

| Source | Location | Precedence |
|---|---|---|
| project | `.weave/employees/*.yaml`, `*.yml`, `*.json` | highest |
| user | `employees.userDir` passed to `planAndRun` | middle |
| built-in | `backend-engineer`, `frontend-engineer`, `database-engineer`, `devops-engineer`, `qa-engineer`, `security-engineer` | lowest |

A project file with the same `id` as a built-in replaces it. `extends: <id>` inherits every field
and overrides only the ones you write (maps merge; lists replace). `id: backend-engineer` with
`extends: backend-engineer` edits the built-in in place. Invalid files, duplicate ids, `extends`
cycles and symlinks that leave the directory are skipped and reported as `error` events in the run
ledger. Nothing is dropped silently.

## Format

```yaml
id: senior-backend-engineer          # kebab-case, unique
name: Senior Backend Engineer
description: Owns the payments API.  # optional
extends: backend-engineer            # optional

responsibilities:                    # matched against task text to assign work
  - API development
  - backend architecture
skills: [typescript, nodejs, postgres]
rules:
  - Money is integer paise, never float.
instructions: |
  Free-form markdown given to the employee on every task.

permissions:
  filesystem:
    read: ["**/*"]                   # shown to the employee; not enforced yet
    write:                           # enforced: tasks outside this are never assigned
      - "apps/api/**"
  deployment: { allowed: false }     # enforced: deploy commands are rejected
  network: { allowed: true }         # enforced when false: curl, git push, npm install…
  git: { commit: false }             # enforced when false

capabilities: [browser]              # engine capabilities this employee needs
engines:
  preferred: [codex]                 # tried first
  allowed: [codex, claude-code]      # anything else is never used

verification:
  required: [typecheck, tests]       # must exist in the project and pass
  preferred: [lint]                  # must pass when the project has them

memory:
  enabled: true
  maxEntries: 200                    # older entries are compacted away
  recallCount: 8                     # entries recalled into each prompt
```

The file format is a strict subset of YAML: maps, lists, inline `[a, b]` lists, quoted and plain
scalars, `|` blocks and comments. Anchors, flow maps and lists of maps are rejected with a line
number. Quote globs that start with `*`. JSON files with the same fields also work.

## What happens on a run

1. **Planner.** The roster is added to the planner prompt, and a task may name an `employee`.
2. **Assignment.** A task goes to the employee the plan named, if its permissions allow it.
   Otherwise the resolver scores every employee on component match, responsibilities, skills, a
   write scope that fits exactly, and past success (5 tasks or more). An employee whose write
   permission does not cover the task, or none of whose allowed engines is configured, is never
   chosen. If the best score is under 2, the task stays unassigned. Logged as `employee.assigned`.
3. **Compilation.** The task gets the employee's write scope as `allowedPaths` (when it had none) and
   its permissions as `TaskContract.policy`, which the runner enforces.
4. **Engine policy.** `allowed` filters the fallback chain, including an adaptive route, and
   `preferred` goes first.
5. **Prompt.** The employee brief (`<employee>`) and recalled memories (`<employee-memory>`) come
   before the coordination briefing. Both are bounded and escaped.
6. **Verification.** After the task finishes, its worktree runs the required and preferred rungs.
   A failure fails the task before merge. Logged as `employee.verified`.
7. **Memory.** The outcome, plus any `taskNotes` decisions and discoveries, is appended to
   `.weave/employee-memory/<id>.ndjson`. Logged as `employee.memory.recorded`.
