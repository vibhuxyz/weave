# Conventions

Standard rules for **every project** — web apps, APIs, workers, realtime systems, AI tools.
For humans and AI agents (Weave, Claude Code) alike.

Copy this folder into any repo as `docs/conventions/`. Put project-only exceptions in
`docs/conventions/PROJECT.md`, never by editing these files per project.

| File | Read it when you touch |
| :--- | :--- |
| [BACKEND.md](./BACKEND.md) | APIs, workers, queues, realtime servers, shared packages |
| [FRONTEND.md](./FRONTEND.md) | React / Next.js / Vite apps |
| [DATABASE.md](./DATABASE.md) | schema, migrations, queries, caches |
| [AI.md](./AI.md) | you are an agent, you review agent output, or the app calls an LLM |
| [CODE_QUALITY.md](./CODE_QUALITY.md) | always |

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