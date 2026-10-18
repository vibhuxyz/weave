export const MENTION_TABS = ["employees", "agents", "skills"] as const;

export type MentionTab = (typeof MENTION_TABS)[number];
