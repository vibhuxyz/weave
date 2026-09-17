import { invoke } from "@tauri-apps/api/core";
import type { CachedAvatar } from "@/shared/avatars";
import { normalizeAvatarLibraryError, type AvatarLibraryError } from "./errors";

type CachedAvatarBatchResult = Record<string, CachedAvatar | null | undefined>;

interface PendingCachedAvatarRequest {
  resolve: (avatar: CachedAvatar | null) => void;
  reject: (error: AvatarLibraryError) => void;
}

let pendingCachedAvatarRequests = new Map<
  string,
  PendingCachedAvatarRequest[]
>();
let cachedAvatarBatchScheduled = false;

function scheduleCachedAvatarBatch(): void {
  if (cachedAvatarBatchScheduled) {
    return;
  }

  cachedAvatarBatchScheduled = true;
  queueMicrotask(() => {
    const pending = pendingCachedAvatarRequests;
    pendingCachedAvatarRequests = new Map();
    cachedAvatarBatchScheduled = false;

    void getCachedAvatarsForRefs({
      avatarRefs: [...pending.keys()],
    })
      .then((avatarsByRef) => {
        for (const [avatarRef, requests] of pending) {
          const avatar = avatarsByRef[avatarRef] ?? null;
          for (const request of requests) {
            request.resolve(avatar);
          }
        }
      })
      .catch((error) => {
        const normalizedError = normalizeAvatarLibraryError(error);
        for (const requests of pending.values()) {
          for (const request of requests) {
            request.reject(normalizedError);
          }
        }
      });
  });
}

export async function getCachedAvatarsForRefs({
  avatarRefs,
}: {
  avatarRefs: string[];
}): Promise<CachedAvatarBatchResult> {
  if (avatarRefs.length === 0) {
    return {};
  }

  try {
    return await invoke("get_cached_avatars_for_refs", {
      avatarRefs,
    });
  } catch (error) {
    throw normalizeAvatarLibraryError(error);
  }
}

export async function getCachedAvatarForRef({
  avatarRef,
}: {
  avatarRef: string;
}): Promise<CachedAvatar | null> {
  return new Promise<CachedAvatar | null>((resolve, reject) => {
    const requests = pendingCachedAvatarRequests.get(avatarRef) ?? [];
    requests.push({ resolve, reject });
    pendingCachedAvatarRequests.set(avatarRef, requests);
    scheduleCachedAvatarBatch();
  });
}
