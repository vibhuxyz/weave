---
name: frontend-performance
description: "Apply when a frontend change touches rendering, lists, realtime data, bundle size, data loading or animation."
---

# Frontend performance

- Put fast-changing values in their own small component so only that leaf re-renders.
- Without the React Compiler: `memo` list rows, `useMemo` for sorting and filtering, `useCallback` only for memoized children or effect deps. With it, write none of these by hand.
- Use `useTransition` for non-urgent updates and `useDeferredValue` when a search input drives a large list.
- Realtime and scroll data: never `setState` per message. Buffer and flush once per frame with `requestAnimationFrame`. Update collections incrementally.
- Start independent requests in parallel. Set `staleTime` on every query. Debounce search (about 300ms) and cancel the previous request with the query `signal`.
- Virtualize lists over about 100 rows. Lazy-load every route and heavy component (charts, editors, maps, modals). Import only what you use.
- Animate only `transform` and `opacity`, and respect `prefers-reduced-motion`.
- Images need `width` and `height`. Do not read layout and write styles in the same loop.

**Why:** Most slowness comes from too many renders and too much JavaScript on first load.

**Rule:** Report a before and after number for any change made for performance. Never invent numbers. Measure first before adding workers, canvas rendering or custom memo.
