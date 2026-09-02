import { parseSessionDeepLink } from "@/features/sessions/lib/sessionDeepLink";

/**
 * Stub of Berd's version.
 *
 * The original dispatches through `@/features/berdctl/commands/registry`,
 * which transitively pulls in most of Berd's app shell. V0 has no session list
 * to open, so the seam is cut here on purpose: the link is still parsed (so
 * message.tsx can tell a session link from a normal one), but opening is a
 * no-op.
 *
 * Implement for real when you add multi-session support.
 */
export function openSessionDeepLink(href: string): Promise<boolean> {
  const sessionId = parseSessionDeepLink(href);
  if (!sessionId) return Promise.resolve(false);

  console.warn("[stub] openSessionDeepLink:", sessionId);
  return Promise.resolve(true);
}
