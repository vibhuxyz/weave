import type { AcpAuthMethod } from "./types.ts";

export interface AcpAuthResult {
  readonly success: boolean;
  readonly error?: string;
  readonly availableMethods?: readonly {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
  }[];
}

export interface AcpSessionClient {
  initialize(): Promise<{
    readonly authMethods?: readonly {
      readonly id: string;
      readonly name: string;
      readonly description?: string;
    }[];
  }>;
  authenticate(methodId: string): Promise<{
    readonly success: boolean;
    readonly error?: string;
  }>;
  shutdown(): Promise<void>;
}

export async function executeAcpAuth(
  method: AcpAuthMethod,
  clientFactory: (server: AcpAuthMethod["server"]) => Promise<AcpSessionClient>,
  selectedMethodId?: string,
): Promise<AcpAuthResult> {
  const client = await clientFactory(method.server);
  try {
    const init = await client.initialize();
    const methodId = selectedMethodId ?? method.preferredMethodId ?? init.authMethods?.[0]?.id;
    if (!methodId) {
      return {
        success: false,
        error: "No authentication method available",
        availableMethods: init.authMethods,
      };
    }
    const result = await client.authenticate(methodId);
    return {
      success: result.success,
      error: result.error,
      availableMethods: init.authMethods,
    };
  } finally {
    await client.shutdown();
  }
}
