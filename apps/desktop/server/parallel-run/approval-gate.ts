export interface ApprovalGate {
  readonly wait: () => Promise<boolean>;
  readonly decide: (approved: boolean) => boolean;
}

export interface ApprovalCallbacks {
  readonly onWaiting: () => void;
  readonly onApproved: () => void;
}

export function createApprovalGate(signal: AbortSignal, callbacks: ApprovalCallbacks): ApprovalGate {
  const pending: { resolve: ((approved: boolean) => void) | null } = { resolve: null };
  const settle = (approved: boolean): boolean => {
    const resolve = pending.resolve;
    if (!resolve) return false;
    pending.resolve = null;
    if (approved) callbacks.onApproved();
    resolve(approved);
    return true;
  };
  signal.addEventListener("abort", () => settle(false), { once: true });
  return {
    wait: () => {
      if (signal.aborted) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        pending.resolve = resolve;
        callbacks.onWaiting();
      });
    },
    decide: settle,
  };
}
