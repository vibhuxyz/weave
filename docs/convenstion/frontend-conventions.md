# Frontend conventions

Scope: React apps (Vite or Next.js). Mobile (Expo) follows the same rules where they apply.

---

## 1. Folder structure

```
src/
├── app/            routes/pages, layout, providers
├── features/
│   └── <feature>/  components/ hooks/ api/ store/ types.ts index.ts
├── shared/
│   ├── components/ UI primitives (shadcn/ui)
│   ├── hooks/      useDebounce, useMediaQuery, ...
│   ├── lib/        api client, formatters, utils
│   └── types/
└── stores/         global stores used by many features
```

* **FE-01 MUST** — import direction: `app → features → shared`. `shared` never imports a feature.
* **FE-02 MUST** — a feature is used from outside only through its `index.ts`.
* **FE-03 SHOULD** — use the `@/` alias, not `../../../`.

## 2. Naming

| Thing | Name | Example |
| :--- | :--- | :--- |
| Component | PascalCase, one per file | `CartSummary.tsx` |
| Hook | `use` + camelCase | `useCart.ts` |
| Store | `xStore.ts` → `useXStore` | `cartStore.ts` |
| Schema / type | `cartSchema` / `Cart` | `type Cart = z.infer<typeof cartSchema>` |
| Event handler prop | `on` + event | `onSubmit`, `onItemRemove` |
| Handler function | `handle` + event | `handleSubmit` |
| Test | next to the file | `formatters.test.ts` |

* **FE-04 MUST** — named exports. Default export only where the framework needs it
  (Next.js pages, `lazy()` routes).
* **FE-05 SHOULD** — split a component file at ~200 lines.

## 3. Where state lives

```
Server data   →  TanStack Query (or Next.js server components)
Global UI     →  Zustand
Local UI      →  useState / useReducer
Forms         →  React Hook Form + Zod
URL state     →  search params (filters, tabs, page)
Imperative    →  useRef
```

* **FE-06 MUST** — never copy server data into Zustand or `useState`. Query is the cache.
* **FE-07 MUST** — never put form state in a global store.
* **FE-08 SHOULD** — anything a user would want to share or refresh (filters, selected tab,
  search term) lives in the URL. (A Flipkart search link should reopen the same results.)
* **FE-09 MUST** — select the smallest slice from a store:
  ```ts
  const count = useCartStore(s => s.items.length);   // ✅
  const { items } = useCartStore();                  // ❌ re-renders on every change
  ```
* **FE-10 MUST** — Query keys come from one factory per feature:
  ```ts
  export const orderKeys = {
    all: ['orders'] as const,
    list: (f: OrderFilter) => [...orderKeys.all, 'list', f] as const,
    detail: (id: string) => [...orderKeys.all, 'detail', id] as const,
  };
  ```

## 4. Data fetching

* **FE-11 MUST** — every API response is parsed with Zod in `features/*/api/`.
  Components never receive unparsed JSON.
* **FE-12 MUST** — one API client (`shared/lib/api.ts`, `fetch` based) handles base URL, auth,
  error-shape parsing and `requestId`. No second HTTP library.
* **FE-13 MUST** — after a mutation, invalidate the related query keys. No manual refetch loops.
* **FE-14 MUST** — no `setInterval` polling for data that has a realtime channel.
* **FE-15 MUST** — components never touch `WebSocket` directly. One hook/service owns the
  connection, reconnect with backoff, and writes into stores or invalidates queries.

## 5. UI states

* **FE-16 MUST** — every data view handles four states: **loading, empty, error, success**.
  An empty list shows a message, not a blank box.
* **FE-17 MUST** — show the server's `error.message` when it gives one. No
  "Something went wrong" when the reason is known. Always show `requestId` in a support-able error.
* **FE-18 MUST** — optimistic UI only for actions that are safe to roll back (like, bookmark,
  reorder). Never show "Paid" or "Sent" before the server confirms.
* **FE-19 MUST** — submit buttons are disabled while pending. Retries reuse the same
  idempotency key.

## 6. Forms

* **FE-20 MUST** — React Hook Form + `zodResolver`. The Zod schema is shared with the backend
  from `packages/contracts` when the shape is the same.
* **FE-21 MUST** — errors show next to the field, in plain words. Validate on blur, not every key.

## 7. Styling (Tailwind)

* **FE-22 MUST** — colours, radius, spacing come from `@theme` tokens. No hex values in components.
* **FE-23 MUST** — UI primitives come from `shared/components`. No second Button implementation.
* **FE-24 MUST** — one icon library per app.
* **FE-25 MUST** — never use colour alone to carry meaning. Add text or an icon.
* **FE-26 SHOULD** — numbers that update or line up in columns use `tabular-nums`.
* **FE-27 SHOULD** — animate only things that change occasionally. Never animate values that
  update many times per second.

## 8. Formatting values

* **FE-28 MUST** — money, dates, numbers, percentages go through `shared/lib/formatters.ts`
  using `Intl`. No inline `toFixed` or manual date strings in JSX.
* **FE-29 MUST** — frontend money math is a **preview** only. The server total is the truth.

## 9. Performance

* **FE-30 MUST** — routes are lazy-loaded. Heavy libraries (charts, editors, PDF) load on demand.
* **FE-31 MUST** — no `React.memo` / `useMemo` / `useCallback` / Web Worker without a profiler
  measurement in the PR.
* **FE-32 MUST** — lists over ~200 rows are virtualized.
* **FE-33 SHOULD** — images have width/height set and use modern formats; below-the-fold images
  are lazy.

## 10. Accessibility

* **FE-34 MUST** — every input has a label; icon-only buttons have `aria-label`.
* **FE-35 MUST** — everything works by keyboard; focus is visible; modals trap and return focus.
* **FE-36 MUST** — use real elements: `<button>` for actions, `<a>` for navigation.
* **FE-37 SHOULD** — text contrast meets WCAG AA.

## 11. Security

* **FE-38 MUST** — nothing secret in public env (`VITE_*`, `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*`).
  These ship to every user.
* **FE-39 MUST** — no `dangerouslySetInnerHTML` unless sanitised with DOMPurify, with a comment.
* **FE-40 MUST** — no tokens in `localStorage` for new apps. Use `HttpOnly` cookies.
  Browser storage is for UI preferences only.
* **FE-41 SHOULD** — strict CSP in production: no `unsafe-inline`, no `unsafe-eval`.