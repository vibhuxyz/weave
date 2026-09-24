export interface UpgradeRequest {
  readonly origin: string | undefined;
  readonly protocolHeader: string | undefined;
}

export type RejectionStatus = 401 | 403;

export type UpgradeDecision =
  | { readonly kind: "accept" }
  | { readonly kind: "reject"; readonly status: RejectionStatus; readonly reason: string };

export type TokenResult =
  | { readonly ok: true; readonly token: string }
  | { readonly ok: false; readonly reason: string };
