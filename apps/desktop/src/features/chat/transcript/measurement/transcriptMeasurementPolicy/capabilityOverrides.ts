import { addReason } from "./capabilities";
import type {
  TranscriptMeasurementSafetyReason,
  TranscriptRowSafetyCapabilities,
  TranscriptRowSafetyCapabilityOverride,
} from "./types";

export function applyCapabilityOverrides(
  capabilities: TranscriptRowSafetyCapabilities,
  reasons: Set<TranscriptMeasurementSafetyReason>,
  overrides: TranscriptRowSafetyCapabilityOverride | undefined,
): void {
  if (!overrides) {
    return;
  }

  for (const key of Object.keys(overrides) as Array<keyof typeof overrides>) {
    if (overrides[key]) {
      capabilities[key] = true;
    }
  }

  if (overrides.stateful) addReason(reasons, "stateful-row");
  if (overrides.hasMcpApp) addReason(reasons, "mcp-app");
  if (overrides.hasHostCalls) addReason(reasons, "host-calls");
  if (overrides.hasHostActionHandlers)
    addReason(reasons, "host-action-handlers");
  if (overrides.hasActiveTimer) addReason(reasons, "active-timer");
  if (overrides.hasActiveToolWork) addReason(reasons, "active-tool");
  if (overrides.hasActiveMcpHostRequest)
    addReason(reasons, "active-mcp-host-work");
  if (overrides.hasActiveNestedToolRequest)
    addReason(reasons, "active-nested-tool-request");
  if (overrides.hasDynamicAsyncLayout)
    addReason(reasons, "dynamic-async-layout");
  if (overrides.hasPendingLayout) addReason(reasons, "layout-pending");
  if (overrides.hasFocusedDescendant) addReason(reasons, "focused-row");
  if (
    overrides.hasOpenOverlay ||
    overrides.hasOpenMenu ||
    overrides.hasOpenDialog ||
    overrides.hasOpenPopover ||
    overrides.hasOpenLightbox
  ) {
    addReason(reasons, "open-overlay");
  }
  if (overrides.hasCopyFeedback) addReason(reasons, "active-copy-feedback");
  if (overrides.hasImageContent) addReason(reasons, "image-content");
  if (overrides.hasToolContent) addReason(reasons, "tool-content");
  if (overrides.hasReasoningContent)
    addReason(reasons, "reasoning-or-thinking");
  if (overrides.hasActionRequired) addReason(reasons, "action-required");
  if (overrides.hasStreamingContent) addReason(reasons, "active-stream");
  if (overrides.hasUnknownUnsafeDescendants)
    addReason(reasons, "unknown-unsafe-descendant");
  if (overrides.protectsSelection) addReason(reasons, "active-selection");
}
