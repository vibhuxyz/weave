import type { WidgetSize, WidgetSizeProfile } from "@/home/canvas/widgets";

export const SIZE_BY_PROFILE_STATE_KEY = "__sizeByProfile";

export function profileKey(profile: WidgetSizeProfile): string {
  return `${profile.defaultSize.width}x${profile.defaultSize.height}`;
}

const LEGACY_CLOCK_PROFILE_KEYS: Record<string, string[]> = {
  "156x156": ["173x173", "240x240"],
  "224x88": ["264x104"],
};

export function rememberedSizeForProfile(
  type: string,
  sizeMemory: Record<string, WidgetSize>,
  profile: WidgetSizeProfile,
): WidgetSize | undefined {
  const key = profileKey(profile);
  return (
    sizeMemory[key] ??
    (type === "clock"
      ? LEGACY_CLOCK_PROFILE_KEYS[key]
          ?.map((legacyKey) => sizeMemory[legacyKey])
          .find((size) => size !== undefined)
      : undefined)
  );
}

export function readSizeMemory(
  state: Record<string, unknown> | undefined,
): Record<string, WidgetSize> {
  const raw = state?.[SIZE_BY_PROFILE_STATE_KEY];
  return raw && typeof raw === "object"
    ? (raw as Record<string, WidgetSize>)
    : {};
}
