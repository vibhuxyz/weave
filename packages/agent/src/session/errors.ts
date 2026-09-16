import type { AuthMethod } from "@weave/protocol";

export class AuthRequiredError extends Error {
  readonly engineId: string;
  readonly authMethods: AuthMethod[];

  constructor(engineId: string, authMethods: AuthMethod[], cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "AuthRequiredError";
    this.engineId = engineId;
    this.authMethods = authMethods;
  }
}
