# The Weave Worker Model

This document clarifies the relationship between worker processes, workspaces, and Git branches, explaining how Weave safely orchestrates concurrent AI coding agents.

## 1. Process, Workspace, and Branch

It is crucial to distinguish between three concepts that are often conflated:

1. **Worker process:** The AI coding agent (e.g., Claude Code, Codex).
2. **Workspace / filesystem:** The physical directory on disk where files reside.
3. **Git branch:** The version control state of that directory.

For example, when a user is working on `/home/vibhu/my-todo/` on the branch `weave/run-123`, the worker is simply a process spawned with its Current Working Directory (CWD) set to `/home/vibhu/my-todo`.

If multiple workers are running, they are just multiple processes with their CWD pointing to the same repository:

```
Worker 1 (Claude Code) ──> cwd = /home/vibhu/my-todo
Worker 2 (Claude Code) ──> cwd = /home/vibhu/my-todo
Worker 3 (Claude Code) ──> cwd = /home/vibhu/my-todo
```

If Worker 1 executes `echo "hello" > src/api/todo.ts`, the file is physically changed at `/home/vibhu/my-todo/src/api/todo.ts`. There is no special "AI file"—it is the normal filesystem.

## 2. How the Agent Edits a File

Weave itself does not write every line of code; the coding agent does that.

When Weave gives a worker a task, it starts the coding agent process (e.g., Claude Code process) pointing to the actual repository.

```
Weave
 │ (spawn)
 ▼
Claude Code process (cwd=/home/vibhu/my-todo)
 │
 ▼
actual repository
```

The agent then executes the normal coding loop:
`inspect` → `reason` → `edit` → `run commands` → `test` → `inspect result` → `edit again`

## 3. What "Edit Actual File" Means

If Weave assigns Task 1 ("Implement Todo API") with allowed paths `src/api/**` to Worker 1, and the worker modifies `src/api/todo.ts`, that change is immediately written to the filesystem. 

Because the change is immediately present in `/home/vibhu/todo/src/api/todo.ts`, a developer opening VS Code will see the change live.

## 4. How Weave Knows the File Changed

To avoid constantly polling files for changes, Weave uses filesystem events.

```
Worker 1
  │ (writes todo.ts)
  ▼
Filesystem
  │ (file modified event)
  ▼
File Watcher
  │
  ▼
Weave Event Bus
```

This generates events like `file.created`, `file.modified`, and `file.deleted` for the Weave Event Bus:

```json
{
  "type": "file.modified",
  "runId": "run-123",
  "workerId": "worker-1",
  "taskId": "T1",
  "path": "src/api/todo.ts",
  "timestamp": "..."
}
```

## 5. UI Updates via Events

The Weave UI receives these events via WebSocket or SSE and updates immediately.

```
Weave Event Bus ──> WebSocket / SSE ──> Weave UI
```

The UI can show exactly what the worker is doing in real-time, e.g., "Files changed: 1 (src/api/todo.ts)".

## 6. The Concurrency Problem

If multiple workers are active on the same shared workspace (`/home/vibhu/todo/`), there is a risk of concurrent edits.

If Worker 1 (Todo API), Worker 2 (Todo UI), and Worker 3 (Tests) all try to modify the same file concurrently, it causes lost changes, race conditions, or broken files.

## 7. Path Ownership

To solve the concurrency problem in a shared workspace, the Coordinator enforces **path ownership** before starting workers.

```
Worker 1 ──> allowed: services/todo/**
Worker 2 ──> allowed: components/todo/**
Worker 3 ──> allowed: tests/todo/**
```

This ensures there are no overlapping files, and workers can safely work concurrently in the same directory.

## 8. Handling Conflicting Ownership

If two workers *need* the same file (e.g., `src/payment.ts`), they cannot be allowed to edit it concurrently in a shared workspace.

When Weave detects an ownership conflict, it has two choices:

*   **Option A — Serialize:** Worker 1 finishes its edits, then Worker 2 begins editing the same file.
*   **Option B — Isolated Worktrees:** Both workers edit the file concurrently in separate, isolated worktrees, and their changes are merged later.

```
             Repository
                 │
        ┌────────┴────────┐
        ▼                 ▼
    Worktree A         Worktree B
        │                 │
       W1                W2
```

## 9. Two Execution Modes

Based on this architecture, Weave supports two execution modes for tasks:

### Mode A — Shared Live Workspace

For independent, non-conflicting tasks.

```
                    /project
                       │
          ┌────────────┼────────────┐
          ↓            ↓            ↓
         W1           W2           W3
       backend       frontend      tests
```
All workers see `/project`, but have non-overlapping ownership.
*   **Advantages:** Real-time changes, simple, fast, user sees changes immediately.

### Mode B — Isolated Worktree

For conflicting tasks where concurrent edits to the same files are required.

```
/project
   │
   ├── .weave/worktrees/T1 ── W1
   │
   └── .weave/worktrees/T2 ── W2
```
Workers commit changes independently in their worktrees, followed by verification and integration back into the main branch.
