export type AvatarLibraryErrorCode = "networkAccess" | "unavailable";

export class AvatarLibraryError extends Error {
  code: AvatarLibraryErrorCode;

  constructor(message: string, code: AvatarLibraryErrorCode) {
    super(message);
    this.name = "AvatarLibraryError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAvatarLibraryErrorCode(
  value: unknown,
): value is AvatarLibraryErrorCode {
  return value === "networkAccess" || value === "unavailable";
}

function fallbackAvatarLibraryErrorMessage(code: AvatarLibraryErrorCode) {
  return code === "networkAccess"
    ? "Unable to load avatar library. Check your network connection and try again."
    : "Avatar library unavailable. Try again.";
}

export function normalizeAvatarLibraryError(
  error: unknown,
): AvatarLibraryError {
  if (error instanceof AvatarLibraryError) {
    return error;
  }

  if (isRecord(error) && isAvatarLibraryErrorCode(error.code)) {
    const message =
      typeof error.message === "string" && error.message.length > 0
        ? error.message
        : fallbackAvatarLibraryErrorMessage(error.code);
    return new AvatarLibraryError(message, error.code);
  }

  if (error instanceof Error) {
    return new AvatarLibraryError(
      error.message || fallbackAvatarLibraryErrorMessage("unavailable"),
      "unavailable",
    );
  }

  if (typeof error === "string" && error.length > 0) {
    return new AvatarLibraryError(error, "unavailable");
  }

  return new AvatarLibraryError(
    fallbackAvatarLibraryErrorMessage("unavailable"),
    "unavailable",
  );
}
