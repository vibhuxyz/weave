---
name: react-frontend
description: "Apply when writing React components, hooks, state, data fetching, forms or accessibility in a frontend app."
---

# React frontend

**State:** server data in TanStack Query, global UI in Zustand, local UI in `useState` or `useReducer`, forms in React Hook Form with Zod, shareable state in URL search params.
- Never copy server data into Zustand or `useState`. Never put form state in a global store.
- Derive values during render. Do not sync derived data with `useEffect` and `setState`.
- Select the smallest Zustand slice. Use `useShallow` when selecting several fields.
- Query keys come from one key factory per feature. Invalidate only the related keys after a mutation.

**Components:**
- Components render. Logic lives in hooks. Fetching lives in `api/` plus hooks, and every response is parsed with Zod.
- Never define a component inside another component. Keys are stable ids, not array indexes.
- Every data view handles loading, empty, error and success. Show the server's error message.
- Disable submit while pending. Optimistic UI only for safely reversible actions. Never show "Paid" or "Sent" before the server confirms.

**Accessibility and safety:**
- Every input has a label and every icon-only button has `aria-label`. `<button>` for actions, `<a>` for navigation.
- No `dangerouslySetInnerHTML` without sanitising. No auth tokens in `localStorage`. No secrets in `VITE_*` or `NEXT_PUBLIC_*`.

**Why:** State kept in one owner cannot drift, and derived values cannot go stale.
