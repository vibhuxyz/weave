export const NEVER_VALUE = "never";

export const AUTO_ARCHIVE_CHOICES: readonly { readonly value: string; readonly label: string; readonly days: number | null }[] = [
  { value: NEVER_VALUE, label: "Never", days: null },
  { value: "1", label: "After 1 day", days: 1 },
  { value: "7", label: "After 1 week", days: 7 },
  { value: "30", label: "After 30 days", days: 30 },
  { value: "90", label: "After 90 days", days: 90 },
];

export const UNTITLED_CHAT = "New chat";
export const SKELETON_ROW_COUNT = 3;
export const OFFLINE_HINT = "Open a project to load this.";
export const ROUNDED_LIST_CLASS = "rounded-xl border border-border bg-background/40 px-4";
