import type { BrowserOAuthMethod } from "./types.ts";

export interface OAuthLauncherResult {
  readonly opened: boolean;
  readonly error?: string;
}

export async function executeOAuthAuth(
  method: BrowserOAuthMethod,
  openUrl: (url: string) => Promise<void>,
): Promise<OAuthLauncherResult> {
  try {
    await openUrl(method.startUrl);
    return { opened: true };
  } catch (err) {
    return {
      opened: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
