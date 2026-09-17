import { parseSessionDeepLink } from "@/features/sessions/lib/sessionDeepLink";


export function openSessionDeepLink(href: string): Promise<boolean> {
  const sessionId = parseSessionDeepLink(href);
  if (!sessionId) return Promise.resolve(false);

  console.warn("[stub] openSessionDeepLink:", sessionId);
  return Promise.resolve(true);
}
