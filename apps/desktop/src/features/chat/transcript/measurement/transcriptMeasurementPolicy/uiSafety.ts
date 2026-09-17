import { addReason } from "./capabilities";
import type {
  TranscriptMeasurementSafetyReason,
  TranscriptRowSafetyCapabilities,
  TranscriptRowUiSafetyState,
} from "./types";

export function applyUiSafetyState(
  capabilities: TranscriptRowSafetyCapabilities,
  reasons: Set<TranscriptMeasurementSafetyReason>,
  uiState: TranscriptRowUiSafetyState | undefined,
): void {
  if (!uiState) {
    return;
  }

  if (uiState.hasFocusedDescendant) {
    capabilities.hasFocusedDescendant = true;
    addReason(reasons, "focused-row");
  }

  if (uiState.protectsSelection) {
    capabilities.protectsSelection = true;
    addReason(reasons, "active-selection");
  }

  const hasOpenOverlay = Boolean(
    uiState.hasOpenOverlay ||
      uiState.hasOpenMenu ||
      uiState.hasOpenDialog ||
      uiState.hasOpenPopover ||
      uiState.hasOpenLightbox,
  );
  if (hasOpenOverlay) {
    capabilities.hasOpenOverlay = true;
    addReason(reasons, "open-overlay");
  }

  if (uiState.hasOpenMenu) capabilities.hasOpenMenu = true;
  if (uiState.hasOpenDialog) capabilities.hasOpenDialog = true;
  if (uiState.hasOpenPopover) capabilities.hasOpenPopover = true;
  if (uiState.hasOpenLightbox) capabilities.hasOpenLightbox = true;

  if (uiState.hasCopyFeedback) {
    capabilities.hasCopyFeedback = true;
    addReason(reasons, "active-copy-feedback");
  }

  if (uiState.hasActiveMcpHostRequest) {
    capabilities.hasActiveMcpHostRequest = true;
    addReason(reasons, "active-mcp-host-work");
  }

  if (uiState.hasActiveNestedToolRequest) {
    capabilities.hasActiveNestedToolRequest = true;
    addReason(reasons, "active-nested-tool-request");
  }

  if (uiState.hasActiveToolWork) {
    capabilities.hasActiveToolWork = true;
    addReason(reasons, "active-tool");
  }

  if (uiState.hasActiveTimer) {
    capabilities.hasActiveTimer = true;
    addReason(reasons, "active-timer");
  }

  if (uiState.hasPendingLayout) {
    capabilities.hasPendingLayout = true;
    addReason(reasons, "layout-pending");
  }

  if (uiState.hasLayoutAnimation) {
    capabilities.hasDynamicAsyncLayout = true;
    addReason(reasons, "layout-animation");
  }

  if (uiState.hasDynamicAsyncLayout) {
    capabilities.hasDynamicAsyncLayout = true;
    addReason(reasons, "dynamic-async-layout");
  }

  if (uiState.hasAsyncCodeHighlighting) {
    capabilities.hasDynamicAsyncLayout = true;
    addReason(reasons, "async-code-highlighting");
  }

  if (uiState.hasUnknownUnsafeDescendants) {
    capabilities.hasUnknownUnsafeDescendants = true;
    addReason(reasons, "unknown-unsafe-descendant");
  }
}
