import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

function changedEventName(key: string): string {
  return `weave:persisted-state-changed:${key}`;
}

/**
 * Multiple components can call this with the same key (e.g. every mounted
 * `useAgents()`), each getting its own React state seeded from localStorage
 * at mount. Without this event, a write from one instance never reaches the
 * others until they remount — a create/edit in one place looks like it
 * silently did nothing everywhere else.
 */
export function usePersistedState<T>(
  key: string,
  defaults: T,
  validate: (value: unknown, defaults: T) => T,
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return defaults;
    try {
      const stored = window.localStorage.getItem(key);
      if (!stored) return defaults;
      return validate(JSON.parse(stored), defaults);
    } catch {
      return defaults;
    }
  });
  const skipNextBroadcastRef = useRef(false);

  useEffect(() => {
    if (skipNextBroadcastRef.current) {
      skipNextBroadcastRef.current = false;
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {

    }
    window.dispatchEvent(new CustomEvent(changedEventName(key), { detail: state }));
  }, [key, state]);

  useEffect(() => {
    const onChangedElsewhere = (event: Event) => {
      skipNextBroadcastRef.current = true;
      setState((event as CustomEvent<T>).detail);
    };
    window.addEventListener(changedEventName(key), onChangedElsewhere);
    return () => window.removeEventListener(changedEventName(key), onChangedElsewhere);
  }, [key]);

  return [state, setState];
}
