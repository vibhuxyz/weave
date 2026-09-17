import type {
  Annotations,
  ImageContent as AcpImageContent,
  Role,
  TextContent as AcpTextContent,
  ToolCallLocation as AcpToolCallLocation,
  ToolCallStatus as AcpToolCallStatus,
  ToolKind,
} from "@agentclientprotocol/sdk";

// ── Wire types (re-exported from ACP SDK) ─────────────────────────────
//
// These are the exact types that come off the ACP WebSocket. We re-export
// them so feature code imports everything from this module. Aliases exist
// only for readability — no reshaping, no field-dropping.

export type { Annotations, Role, ToolKind };
export type ToolCallLocation = AcpToolCallLocation;

export type VoiceSpeechStatus =
  | "speaking"
  | "spoken"
  | "interrupted"
  | "notSpoken"
  | "failed";

export interface VoiceSpeechState {
  status: VoiceSpeechStatus;
  /** Ephemeral source-text cutoff for completed speech; never serialized. */
  spokenThrough?: number;
  confidence?: "low" | "medium";
  interruptionCause?: "userSpeaking" | "voiceStopped";
}

/** ACP TextContent with discriminator and local voice playback state. */
export type TextContent = AcpTextContent & {
  type: "text";
  speech?: VoiceSpeechState;
};

/** ACP ImageContent with discriminator. */
export type ImageContent = AcpImageContent & { type: "image" };

/**
 * Tool call execution status.
 *
 * The four ACP wire values plus `"stopped"`, a renderer-only extension
 * for user-cancelled tool calls.
 */
export type ToolCallStatus = AcpToolCallStatus | "stopped";

// ── Message role ──────────────────────────────────────────────────────

/**
 * ACP defines `Role = "user" | "assistant"`. The renderer adds `"system"`
 * for locally-synthesized notification messages.
 */
export type MessageRole = Role | "system";
