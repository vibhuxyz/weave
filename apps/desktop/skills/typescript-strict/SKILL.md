---
name: typescript-strict
description: "Apply when reading or writing any .ts or .tsx file. Strict TypeScript with noUncheckedIndexedAccess, Zod-parsed input, discriminated unions and no any, non-null assertions or ts-ignore."
---

# Strict TypeScript

Code must compile under `strict: true` and `noUncheckedIndexedAccess: true`.

**Rules:**
- Index access returns `T | undefined`. Handle it: `match?.[1]?.trim()` or an early return, never `match[1].trim()`.
- No `any`. Take `unknown` and parse it with Zod.
- No non-null `!`. No `@ts-ignore`, `@ts-expect-error` or `eslint-disable`. Fix the problem.
- Infer types from schemas with `z.infer`. Never write the same shape twice.
- Model states as discriminated unions, not several booleans. End a `switch` on a union with an exhaustive `never` check.
- Prefer `readonly` arrays and `as const` for data that must not change. Use `satisfies` to check config objects without losing literal types.
- Never use `number` for money. Use bigint minor units or a string with a currency.
- Use `import type` for type-only imports, named exports, and no `export *`.
- Expected failures return a `Result`. `throw` only for bugs.
- Pass only the data a function needs. Max 3 positional parameters, then one options object. No boolean parameters.
- Units go in names: `timeoutMs`, `amountPaise`. Booleans start with `is`, `has`, `can` or `should`.

**Why:** The compiler is the cheapest reviewer. Each escape hatch (`any`, `!`, `ts-ignore`) hides a bug until runtime.

**Check before finishing:** typecheck passes without a new suppression, and every `T | undefined` is handled.
