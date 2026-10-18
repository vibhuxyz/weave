---
name: git-commits
description: "Apply when committing: one logical change per commit, only after verification passes."
---

# Git commits

- One logical change per commit, made after typecheck, lint and build pass.
- Stage only the files that belong to the change. Check `git status` and `git diff --staged` first.
- Message in the imperative, under 72 characters, saying what changed. No `wip`, `fixes` or emoji.
- Formatting-only and move-only changes get their own commit. Use `git mv` for moves so history is kept.
- A reorganization is its own task and commit: moves and import updates only, no logic changes.
- Ask before touching money logic, auth, dropping or altering columns, CI or deploy, dependencies, or moving existing files.

**Why:** Small, verified commits can be reviewed and reverted one at a time.
