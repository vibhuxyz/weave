import type { LayoutItemKind } from "@/home/canvas/layout";

export const HOME_LAYOUT_REPLACE_KINDS = [
  "clock",
  "stickyNote",
  "checklist",
  "photo",
  "persona",
  "session",
  "project",
  "automation",
  "skill",
  "prompt",
] as const satisfies LayoutItemKind[];

export type HomeLayoutKind = (typeof HOME_LAYOUT_REPLACE_KINDS)[number];

export const STARTER_PROJECT_ID = "onboarding-starter-project";
export const DIGITAL_CLOCK_TARGET_SUFFIX = ":digital";
export const SIZE_BY_PROFILE_STATE_KEY = "__sizeByProfile";
export const LABEL_WIDGET_VARIANT = "label";

// Matches the send pipeline's prompt bound (berdctl session create).
export const PROMPT_PIN_TEXT_MAX_LENGTH = 50_000;
export const PROMPT_PIN_TITLE_MAX_LENGTH = 200;

export const KIND_TO_WIDGET_TYPE = {
  clock: "clock",
  stickyNote: "stickyNote",
  checklist: "checklist",
  photo: "photo",
  persona: "agentPin",
  session: "chatPin",
  project: "projectArtifactPin",
  automation: "automationOutputPin",
  skill: "skillPin",
  prompt: "promptPin",
} as const satisfies Record<HomeLayoutKind, string>;

export const WIDGET_TYPE_TO_KIND: Partial<Record<string, HomeLayoutKind>> = {
  onboardingTour: "stickyNote",
  onboardingProjectArtifact: "stickyNote",
  clock: "clock",
  stickyNote: "stickyNote",
  label: "stickyNote",
  checklist: "checklist",
  photo: "photo",
  agentPin: "persona",
  chatPin: "session",
  projectArtifactPin: "project",
  automationOutputPin: "automation",
  skillPin: "skill",
  promptPin: "prompt",
};

export function isHomeLayoutKind(kind: LayoutItemKind): kind is HomeLayoutKind {
  switch (kind) {
    case "clock":
    case "stickyNote":
    case "checklist":
    case "photo":
    case "persona":
    case "session":
    case "project":
    case "automation":
    case "skill":
    case "prompt":
      return true;
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
