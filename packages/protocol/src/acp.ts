/**
 * ACP wire types, re-exported.
 *
 * Every other package imports ACP types from here, not from the SDK directly.
 * When the SDK version moves, this is the one file that has to notice.
 */
export type {
  AuthMethod,
  AuthMethodTerminal,
  AuthenticateRequest,
  InitializeResponse,
  ModelInfo,
  PermissionOption,
  PermissionOptionKind,
  ReadTextFileRequest,
  ReadTextFileResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionConfigOption,
  SessionNotification,
  SessionUpdate,
  ToolCallStatus,
  ToolKind,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
