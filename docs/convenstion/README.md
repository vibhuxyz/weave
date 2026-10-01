# Conventions

Standard rules for **every project** — web apps, APIs, workers, realtime systems, AI tools.
For humans and AI agents (Weave, Claude Code) alike.

Copy this folder into any repo as `docs/conventions/`. Put project-only exceptions in
`docs/conventions/PROJECT.md`, never by editing these files per project.

Product behavior is [../PRODUCT.md](../PRODUCT.md), not these files.

| File | Read it when you touch |
| :--- | :--- |
| [backend-conventions.md](./backend-conventions.md) | APIs, workers, queues, realtime servers, shared packages |
| [frontend-conventions.md](./frontend-conventions.md) | React / Next.js / Vite apps |
| [database-conventions.md](./database-conventions.md) | schema, migrations, queries, caches |
| [ai-conventions.md](./ai-conventions.md) | you are an agent, you review agent output, or the app calls an LLM |
| [code-quality-conventions.md](./code-quality-conventions.md) | always |

## How the rules work

* Every rule has an ID (`BE-04`, `DB-12`). Cite it in reviews and commit bodies.
* **MUST** = review or CI blocks the merge. **SHOULD** = break it only with a reason in the PR.
* A rule that does not fit a project gets an entry in `PROJECT.md`:
  `BE-21 — not used: no list endpoints`.
* A rule that is wrong everywhere gets fixed here, in its own commit.

## When documents disagree

```
DECISIONS.md  >  PROJECT.md  >  conventions/*  >  roadmap / TODO docs  >  code comments
```

## Assumed default stack

TypeScript · Node · React / Next.js · Postgres (Prisma or Drizzle) · Redis · RabbitMQ ·
WebSockets · Docker · GitHub Actions · Turborepo / pnpm.
Rules are written so they still hold if one piece changes.