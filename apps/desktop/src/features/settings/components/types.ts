export type SettingsTabId =
  | "appearance"
  | "behavior"
  | "connections"
  | "ai-providers"
  | "notifications"
  | "keyboard-shortcuts"
  | "voice"
  | "archive"
  | "security"
  | "system"
  | "experiments";

export interface SettingsTabItem {
  readonly id: SettingsTabId;
  readonly label: string;
  readonly iconName: string;
}

export interface HarnessAuthMethodInfo {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface HarnessDescriptor {
  readonly id: string;
  readonly label: string;
  readonly subtitle: string;
  readonly packageName?: string;
  readonly defaultInstalled?: boolean;
  readonly versionInfo?: string;
  readonly isCustomHarness?: boolean;
  readonly hasSubCard?: boolean;
  readonly installCommand?: string;
  readonly authUrl?: string;
}

export interface HarnessInstallLog {
  readonly harnessId: string;
  readonly phase: "installing" | "verifying" | "done" | "error";
  readonly lines: readonly string[];
}
