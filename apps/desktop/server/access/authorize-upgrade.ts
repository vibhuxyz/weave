import { timingSafeEqual } from "node:crypto";
import { ALLOWED_ORIGINS, PROTOCOL_LIST_SEPARATOR, TOKEN_PROTOCOL_PREFIX, WEAVE_PROTOCOL } from "./constants.ts";
import type { UpgradeDecision, UpgradeRequest } from "./types.ts";

export function offeredProtocols(header: string | undefined): readonly string[] {
  if (header === undefined) return [];
  return header.trim().split(PROTOCOL_LIST_SEPARATOR).filter((protocol) => protocol.length > 0);
}

function presentedToken(protocols: readonly string[]): string | null {
  const offer = protocols.find((protocol) => protocol.startsWith(TOKEN_PROTOCOL_PREFIX));
  return offer === undefined ? null : offer.slice(TOKEN_PROTOCOL_PREFIX.length);
}

function tokensMatch(presented: string, expected: string): boolean {
  const presentedBytes = Buffer.from(presented, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (presentedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(presentedBytes, expectedBytes);
}

export function authorizeUpgrade(request: UpgradeRequest, expectedToken: string): UpgradeDecision {
  if (request.origin === undefined) return { kind: "reject", status: 403, reason: "missing origin" };
  if (!ALLOWED_ORIGINS.has(request.origin)) {
    return { kind: "reject", status: 403, reason: `origin ${request.origin} is not allowed` };
  }
  const protocols = offeredProtocols(request.protocolHeader);
  if (!protocols.includes(WEAVE_PROTOCOL)) return { kind: "reject", status: 401, reason: `missing ${WEAVE_PROTOCOL} protocol` };
  const presented = presentedToken(protocols);
  if (presented === null) return { kind: "reject", status: 401, reason: "missing token" };
  if (!tokensMatch(presented, expectedToken)) return { kind: "reject", status: 401, reason: "wrong token" };
  return { kind: "accept" };
}
